'use strict';

const common = require('./common');
const { ResponseError, ValidationError } = require('./errors');
const Enum = require('./enum');
const { Communication, Errors: CommunicationErrors } = require('@squeep/indieauth-helper');
const Template = require('./template');
const { MysteryBox } = require('@squeep/mystery-box');
const DBErrors = require('./db/errors');
const Chores = require('./chores');
const { Publisher: QueuePublisher } = require('@squeep/amqp-helper');

const _fileScope = common.fileScope(__filename);

// These are used during request ingestion and validation
const validBase64URLRE = /^[-A-Za-z0-9_]+$/;
const scopeSplitRE = / +/;

const supportedCodeChallengeMethods = ['S256', 'SHA256'];

class Manager {
  constructor(logger, db, options) {
    this.options = options;
    this.logger = logger;
    this.db = db;
    this.chores = new Chores(logger, db, options);
    this.communication = new Communication(logger, options);
    if (options.queues.amqp.url) {
      this.queuePublisher = new QueuePublisher(logger, options.queues.amqp);
    }
    this.mysteryBox = new MysteryBox(options);
    this.mysteryBox.on('statistics', common.mysteryBoxLogger(logger, _fileScope(this.constructor.name)));

    // We need to know how the outside world sees us, to verify if a
    // profile indicates us as the auth server.
    // selfBaseUrl should already include proxy prefix and end with a /
    this.selfAuthorizationEndpoint = options.dingus.selfBaseUrl + options.route.authorization;
  }


  /**
   * Perform any async startup tasks.
   */
  async initialize() {
    if (this.queuePublisher) {
      await this._connectQueues();
    }
  }


  async _connectQueues() {
    await this.queuePublisher.connect();
    await this.queuePublisher.establishAMQPPlumbing(this.options.queues.ticketPublishName);
  }


  /**
   * Add an error to a session, keeping only the most-severe code, but all descriptions.
   * This error is sent along on the redirection back to client endpoint.
   * @param {Object} ctx
   * @param {Object} ctx.session
   * @param {String[]=} ctx.session.errorDescriptions
   * @param {String=} ctx.session.error
   * @param {String} error
   * @param {String} errorDescription
   */
  static _setError(ctx, error, errorDescription) {
    const errorPrecedence = [ // By increasing severity
      'invalid_scope',
      'unsupported_response_type',
      'access_denied',
      'unauthorized_client',
      'invalid_grant',
      'invalid_request',
      'temporarily_unavailable',
      'server_error',
    ];
    if (!(errorPrecedence.includes(error))) {
      throw new RangeError(`invalid error value '${error}'`);
    }
    if (!ctx.session.errorDescriptions) {
      ctx.session.errorDescriptions = [];
    }
    if (!common.validError(errorDescription)) {
      throw new RangeError(`invalid error description '${errorDescription}'`);
    }
    const isHigherPrecedence = errorPrecedence.indexOf(error) > errorPrecedence.indexOf(ctx.session.error);
    if (!ctx.session.error || isHigherPrecedence) {
      ctx.session.error = error;
    }
    if (isHigherPrecedence) {
      ctx.session.errorDescriptions.unshift(errorDescription);
    } else {
      ctx.session.errorDescriptions.push(errorDescription);
    }
  }


  /**
   * Discourage caching of a response.
   * OAuth 2.1 §3.2.3
   * The authorization server MUST include the HTTP Cache-Control response
   * header field with a value of no-store in any response
   * containing tokens, credentials, or other sensitive information.
   * @param {http.ServerResponse} res
   */
  static _sensitiveResponse(res) {
    Object.entries({
      [Enum.Header.CacheControl]: 'no-store',
      [Enum.Header.Pragma]: 'no-cache',
    }).forEach(([k, v]) => res.setHeader(k, v));
  }


  /**
   * Sets params entries as url search parameters.
   * @param {URL} url
   * @param {Object} params
   */
  static _setSearchParams(url, params) {
    Object.entries(params).forEach((param) => url.searchParams.set(...param));
  }


  /**
   * Serve the informational root page.
   * @param {http.ClientRequest} req 
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async getRoot(res, ctx) {
    const _scope = _fileScope('getRoot');
    this.logger.debug(_scope, 'called', { ctx });

    res.end(Template.rootHTML(ctx, this.options));
    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * Serve the metadata for this service.
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async getMeta(res, ctx) {
    const _scope = _fileScope('getMeta');
    this.logger.debug(_scope, 'called', { ctx });

    const base = this.options.dingus.selfBaseUrl;
    const endpoint = (r) => `${base}${this.options.route[r]}`; // eslint-disable-line security/detect-object-injection
  
    const metadata = {
      issuer: base,
      'authorization_endpoint': endpoint('authorization'),
      'token_endpoint': endpoint('token'),
      ...(this.queuePublisher && { 'ticket_endpoint': endpoint('ticket') }),
      'introspection_endpoint': endpoint('introspection'),
      'introspection_endpoint_auth_methods_supported': ['Bearer'],
      'revocation_endpoint': endpoint('revocation'),
      'revocation_endpoint_auth_methods_supported': ['none'],
      'scopes_supported': ['profile', 'email'], // only advertise minimum IA scopes
      'response_types_supported': 'code',
      'grant_types_supported': [
        'authorization_code',
        'refresh_token',
        ...(this.queuePublisher && ['ticket'] || []),
      ],
      'service_documentation': 'https://indieauth.spec.indieweb.org/',
      'code_challenge_methods_supported': supportedCodeChallengeMethods,
      'authorization_response_iss_parameter_supported': true,
      'userinfo_endpoint': endpoint('userinfo'),
    };

    res.end(JSON.stringify(metadata));
    this.logger.info(_scope, 'finished', { ctx });
  }

  
  /**
   * Process an authorization request from a client.
   * User has authenticated, check if user matches profile,
   * present user with consent form.
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async getAuthorization(res, ctx) {
    const _scope = _fileScope('getAuthorization');
    this.logger.debug(_scope, 'called', { ctx });

    Manager._sensitiveResponse(res);

    ctx.session = Object.assign({}, ctx.session, {
      errorDescriptions: [],
    });

    // Ingest and validate expected data, populating ctx.session.
    await this._clientIdRequired(ctx);
    Manager._redirectURIRequired(ctx);
    Manager._responseTypeRequired(ctx);
    Manager._stateRequired(ctx);
    this._codeChallengeMethodRequired(ctx);
    this._codeChallengeRequired(ctx);
    this._scopeOptional(ctx);
    await this._meOptional(ctx);

    if (!ctx.session.clientIdentifier || !ctx.session.redirectUri) {
      // Do not redirect if either of these fields were invalid, just report error.
      this.logger.debug(_scope, 'invalid request, not redirecting', { ctx });

      // Set error response for template to render.
      ctx.errors.push('Cannot redirect to client application.');
      ctx.errorContent = [
        'There was an error in the request sent by the application attempting to authenticate you. Check with that service.',
      ];
      res.statusCode = 400;
      res.end(Template.authorizationErrorHTML(ctx, this.options));
      this.logger.info(_scope, 'bad request', { ctx });
      return;
    }

    await this.db.context(async (dbCtx) => {
      const profilesScopes = await this.db.profilesScopesByIdentifier(dbCtx, ctx.authenticationId);
      Object.assign(ctx.session, {
        profiles: [],
        profileScopes: {},
        scopeIndex: {},
      }, profilesScopes);
    }); // dbCtx

    if (!ctx.session.profiles.length) {
      this.logger.error(_scope, 'identifier has no profiles', { ctx });
      Manager._setError(ctx, 'access_denied', 'Profile not valid for the authenticated user.');
    }

    if (!this._profileValidForIdentifier(ctx)) {
      // if the hinted profile supplied in me does not match any known
      // profile mappings for the authenticated identifier, remove the
      // hint.  UI will prompt to choose from available profiles.
      this.logger.debug(_scope, 'removing provided me hint, not valid for identifier', { ctx });
      delete ctx.session.me;
    }

    // Ugly support logic for allowing legacy non-pkce requests, for the micropub.rocks site until it is updated.
    // Require both be missing to qualify as a legacy request, otherwise still fail.
    const isMissingBothPKCE = (!ctx.session.codeChallengeMethod) && (!ctx.session.codeChallenge);
    if (isMissingBothPKCE && this.options.manager.allowLegacyNonPKCE) {
      ctx.notifications.push('<div class="legacy-warning">This request was submitted using an unsupported legacy format, which does not include PKCE safeguards!  This is a security issue!  This request should not be accepted!</div>');
    } else {
      if (!ctx.session.codeChallenge) {
        Manager._setError(ctx, 'invalid_request', 'missing required parameter \'code_challenge\'');
      }
      if (!ctx.session.codeChallengeMethod) {
        Manager._setError(ctx, 'invalid_request', 'missing required parameter \'code_challenge_method\'');
      }
    }

    // If anything went wrong, redirect with error report.
    if (ctx.session.error) {
      // Valid redirect_url and client_id, errors hop back to them.
      this.logger.debug(_scope, 'invalid request, redirecting', { ctx });

      Manager._setSearchParams(ctx.session.redirectUri, {
        'state': ctx.session.state,
        'error': ctx.session.error,
        'error_description': ctx.session.errorDescriptions.join(', '),
      });
      res.statusCode = 302; // Found
      res.setHeader(Enum.Header.Location, ctx.session.redirectUri.href);
      res.end();
      this.logger.info(_scope, 'bad request', { ctx });
      return;
    }

    // Store the current state of this session, to be forwarded on to consent processing.
    // This blob will be passed on as a form field in consent response.
    ctx.session.persist = await this.mysteryBox.pack({
      id: common.requestId(), // codeId in database
      clientId: ctx.session.clientId.href,
      clientIdentifier: ctx.session.clientIdentifier,
      redirectUri: ctx.session.redirectUri.href,
      responseType: ctx.session.responseType,
      state: ctx.session.state,
      codeChallengeMethod: ctx.session.codeChallengeMethod,
      codeChallenge: ctx.session.codeChallenge,
      me: ctx.session.me,
      profiles: ctx.session.profiles,
      requestedScopes: ctx.session.scope,
      authenticationId: ctx.authenticationId,
    });

    // Present authenticated user the option to submit consent
    const content = Template.authorizationRequestHTML(ctx, this.options);
    res.end(content);

    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * Validates, fetches, and parses client_id url, populating clientIdentifier with client h-app data.
   * @param {Object} ctx
   */
  async _clientIdRequired(ctx) {
    if (ctx.queryParams['client_id']) {
      try {
        ctx.session.clientId = await this.communication.validateClientIdentifier(ctx.queryParams['client_id']);
        ctx.session.clientIdentifier = await this.communication.fetchClientIdentifier(ctx.session.clientId);
        if (!ctx.session.clientIdentifier) {
          Manager._setError(ctx, 'invalid_request', 'invalid client_id: could not fetch');
          throw new ValidationError('could not fetch');
        }
      } catch (e) {
        ctx.session.clientId = undefined;
        if (e instanceof CommunicationErrors.ValidationError) {
          Manager._setError(ctx, 'invalid_request', e.message);
        }
        Manager._setError(ctx, 'invalid_request', 'invalid value for parameter \'client_id\'');
      }
    } else {
      Manager._setError(ctx, 'invalid_request', 'missing required parameter \'client_id\'');
    }
  }


  /**
   * Ensure redirect_uri exists and is corroborated by clientIdentifier data.
   * @param {Object} ctx 
   */
  static _redirectURIRequired(ctx) {
    if (ctx.queryParams['redirect_uri']) {
      try {
        ctx.session.redirectUri = new URL(ctx.queryParams['redirect_uri']);

        if (ctx.session.clientId) {
          // Either all these parts must match, or a specific alternative must be specified.
          const redirectMatchesClientId = ['protocol', 'hostname', 'port']
            .map((p) => ctx.session.redirectUri[p] == ctx.session.clientId[p]) // eslint-disable-line security/detect-object-injection
            .reduce((acc, match) => acc && match, true);

          // Check for alternate redirect_uri entries on client_id data if no initial match
          if (!redirectMatchesClientId) {
            const validRedirectUris = ctx.session?.clientIdentifier?.['rels']?.['redirect_uri'] || [];
            if (!validRedirectUris.includes(ctx.session.redirectUri.href)) {
              Manager._setError(ctx, 'invalid_request', 'redirect_uri not valid for that client_id');
              // Remove invalid redirect_uri from session; doing this eases error routing.
              ctx.session.redirectUri = undefined;
            }
          }
        }
      } catch (e) {
        Manager._setError(ctx, 'invalid_request', 'invalid value for parameter \'redirect_uri\'');
      }
    } else {
      Manager._setError(ctx, 'invalid_request', 'missing required parameter \'redirect_uri\'');
    }
  }


  /**
   * response_type must be valid
   * @param {Object} ctx
   */
  static _responseTypeRequired(ctx) {
    ctx.session.responseType = ctx.queryParams['response_type'];
    if (ctx.session.responseType) {
      // Must be one of these types
      if (!['code'].includes(ctx.session.responseType)) {
        Manager._setError(ctx, 'unsupported_response_type', 'invalid value for parameter \'response_type\'');
      }
    } else {
      Manager._setError(ctx, 'invalid_request', 'missing required parameter \'response_type\'');
    }
  }


  /**
   * A state parameter must be present
   * @param {Object} ctx 
   */
  static _stateRequired(ctx) {
    ctx.session.state = ctx.queryParams['state'];
    if (ctx.session.state) {
      // No restrictions on content of this
    } else {
      Manager._setError(ctx, 'invalid_request', 'missing required parameter \'state\'');
    }
  }


  /**
   * A code_challenge_method must be present and valid
   * @param {Object} ctx
   */
  _codeChallengeMethodRequired(ctx) {
    ctx.session.codeChallengeMethod = ctx.queryParams['code_challenge_method'];
    if (ctx.session.codeChallengeMethod) {
      if (!supportedCodeChallengeMethods.includes(ctx.session.codeChallengeMethod)) {
        Manager._setError(ctx, 'invalid_request', 'unsupported code_challenge_method');
      }
    } else {
      if (this.options.manager.allowLegacyNonPKCE) {
        return;
      }
      Manager._setError(ctx, 'invalid_request', 'missing required parameter \'code_challenge_method\'');
    }
  }


  /**
   * A code_challenge must be present
   * @param {Object} ctx
   */
  _codeChallengeRequired(ctx) {
    ctx.session.codeChallenge = ctx.queryParams['code_challenge'];
    if (ctx.session.codeChallenge) {
      if (!validBase64URLRE.test(ctx.session.codeChallenge)) {
        Manager._setError(ctx, 'invalid_request', 'invalid value for parameter \'code_challenge\'');
      }
    } else {
      if (this.options.manager.allowLegacyNonPKCE) {
        return;
      }
      Manager._setError(ctx, 'invalid_request', 'missing required parameter \'code_challenge\'');
    }
  }


  /**
   * Scopes may be present, with one known combination limitation
   * @param {Object} ctx
   */
  _scopeOptional(ctx) {
    const _scope = _fileScope('_scopeOptional');
    const scope = ctx.queryParams['scope'];
    ctx.session.scope = [];
    if (scope) {
      const allScopes = scope.split(scopeSplitRE);
      const validScopes = allScopes.filter((s) => common.validScope(s));
      ctx.session.scope.push(...validScopes);
      if (allScopes.length != validScopes.length) {
        const invalidScopes = allScopes.filter((s) => !common.validScope(s));
        this.logger.debug(_scope, 'client requested invalid scope', { ctx, invalidScopes });
      }
    }
    // If email scope is requested, profile scope must also be explicitly requested.
    if (ctx.session.scope.includes('email')
    &&  !ctx.session.scope.includes('profile')) {
      Manager._setError(ctx, 'invalid_scope', 'cannot provide \'email\' scope without \'profile\' scope');
    }
  }


  /**
   * Parses me, if provided
   * @param {Object} ctx
   */
  async _meOptional(ctx) {
    const me = ctx.queryParams['me'];
    if (me) {
      try {
        ctx.session.me = await this.communication.validateProfile(me);
      } catch (e) {
        ctx.session.me = undefined;
      }
    }
  }


  /**
   * Ensure authenticated identifier matches profile.
   * @param {Object} ctx
   * @returns {Boolean}
   */
  _profileValidForIdentifier(ctx) {
    const _scope = _fileScope('_profileValidForIdentifier');

    if (!ctx.session.me) {
      this.logger.debug(_scope, 'no profile provided, cannot correlate', { ctx });
      return false;
    }

    return ctx.session.profiles.includes(ctx.session.me.href);
  }


  /**
   * Get numeric value from form field data.
   * @param {*} ctx
   * @param {String} field
   * @param {String} customField
   * @returns {Number=}
   */
  _parseLifespan(ctx, field, customField) {
    const _scope = _fileScope('_parseLifespan');

    const presetValues = {
      'never': undefined,
      '1d': 86400,
      '1w': 86400 * 7,
      '1m': 86400 * 31,
    };
    const fieldValue = ctx.parsedBody[field]; // eslint-disable-line security/detect-object-injection
    if (fieldValue in presetValues) {
      return presetValues[fieldValue]; // eslint-disable-line security/detect-object-injection
    }

    if (fieldValue === 'custom') {
      const expiresSeconds = parseInt(ctx.parsedBody[customField], 10); // eslint-disable-line security/detect-object-injection
      if (isFinite(expiresSeconds) && expiresSeconds > 0) {
        return expiresSeconds;
      } else {
        this.logger.debug(_scope, 'invalid custom value', { ctx, field, customField });
      }
    }

    this.logger.debug(_scope, 'invalid value', { ctx, field, customField });
    return undefined;
  }


  /**
   * Validate any accepted scopes, ensure uniqueness, return as array.
   * @param {Object} ctx
   * @returns {String=}
   */
  _parseConsentScopes(ctx) {
    const _scope = _fileScope('_ingestConsentScopes');
    const acceptedScopesSet = new Set();
    const rejectedScopesSet = new Set();

    const submittedScopes = common.ensureArray(ctx.parsedBody['accepted_scopes'])
      .concat((ctx.parsedBody['ad_hoc_scopes'] || '').split(scopeSplitRE));
    submittedScopes.forEach((scope) => {
      if (scope) {
        (common.validScope(scope) ? acceptedScopesSet : rejectedScopesSet).add(scope);
      }
    });

    // If email scope was accepted but profile was not, elide email scope
    if (acceptedScopesSet.has('email')
    &&  !acceptedScopesSet.has('profile')) {
      acceptedScopesSet.delete('email');
      rejectedScopesSet.add('email (without profile)');
    }

    if (rejectedScopesSet.size) {
      this.logger.debug(_scope, 'ignoring invalid scopes', { ctx, rejectedScopes: Array.from(rejectedScopesSet) });
    }

    return Array.from(acceptedScopesSet);
  }


  /**
   * Parse and validate selected me is a valid profile option.
   * @param {Object} ctx
   * @returns {URL}
   */
  _parseConsentMe(ctx) {
    const _scope = _fileScope('_parseConsentMe');
    const selectedMe = ctx.parsedBody['me'];
    try {
      const me = new URL(selectedMe);
      if (ctx.session.profiles.includes(me.href)) {
        return me;
      } else {
        this.logger.debug(_scope, 'selected \'me\' profile not among available', { me, available: ctx.session.profiles, ctx });
        Manager._setError(ctx, 'invalid_request', 'invalid profile url');
      }
    } catch (e) {
      this.logger.debug(_scope, 'failed to parse selected \'me\' as url', { error: e, ctx });
      Manager._setError(ctx, 'invalid_request', 'invalid profile url');
    }
    return undefined;
  }


  /**
   * Get up-to-date profile data from selected profile endpoint.
   * @param {Object} ctx
   * @returns {Object}
   */
  async _fetchConsentProfileData(ctx) {
    const _scope = _fileScope('_fetchConsentProfileData');
    try {
      const profile = await this.communication.fetchProfile(ctx.session.me);
      if (!profile) {
        this.logger.debug(_scope, 'no profile data at \'me\' endpoint', { ctx });
        Manager._setError(ctx, 'temporarily_unavailable', 'unable to retrieve profile');
      } else {
        // Profile info gets persisted in code, only include known profile fields to help keep size down.
        return common.pick(profile, [
          'name',
          'photo',
          'url',
          'email',
        ]);
      }
    } catch (e) {
      this.logger.debug(_scope, 'failed to fetch \'me\' endpoint', { error: e, ctx });
      Manager._setError(ctx, 'temporarily_unavailable', 'could not reach profile endpoint');
    }
    return undefined;
  }


  /**
   * Ingest user consent response details, redirect as needed.
   * Receives POST request from consent page, expecting these form fields:
   *   session - encrypted data collected from initial auth call
   *   accept - 'true' if consent was granted
   *   accepted_scopes - list of scopes to grant
   *   ad_hoc_scopes - additional scopes specified by user
   *   me - selected profile to identify as
   *   expires - optional lifespan
   *   expires-seconds - optional custom lifespan
   *   refresh - optional refresh lifespan
   *   refresh-seconds - optional custom refresh lifespan
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async postConsent(res, ctx) {
    const _scope = _fileScope('postConsent');
    this.logger.debug(_scope, 'called', { ctx });

    Manager._sensitiveResponse(res);

    // Ensure session exists, persisting any login session data.
    ctx.session = Object.assign({}, ctx.session);
    try {
      // Recover the session established on initial auth request.
      const oldSession = await this.mysteryBox.unpack(ctx.parsedBody['session']);
      Object.assign(ctx.session, oldSession);
      ctx.session.redirectUri = new URL(ctx.session.redirectUri);
      ctx.session.clientId = new URL(ctx.session.clientId);
    } catch (e) {
      this.logger.debug(_scope, 'failed to unpack session', { error: e, ctx });
      Manager._setError(ctx, 'invalid_request', 'un-parsable data in authorization consent');
    }

    // If these are missing, we cannot proceed.
    if (!ctx.session.clientId || !ctx.session.redirectUri) {
      // Set error response for html template to render.
      ctx.errors = [
        'Cannot redirect to client application.',
      ];
      ctx.errorContent = [
        'There was an error in the request sent by the application attempting to authenticate you. Check with that service.',
      ];
      res.statusCode = 400;
      res.end(Template.authorizationErrorHTML(ctx, this.options));
      this.logger.info(_scope, 'bad request, cannot redirect', { ctx });
      return;
    }
    
    // TODO: Should probably re-validate more unpacked session values, even though those should be trustable.

    // Check if we need to check anything else.
    ctx.session.accept = (ctx.parsedBody['accept'] === 'true');
    if (!ctx.session.accept) {
      this.logger.debug(_scope, 'consent denied', { ctx });
      Manager._setError(ctx, 'access_denied', 'authorization was not granted');
    } else {
      // Ingest form data.
      ctx.session.acceptedScopes = this._parseConsentScopes(ctx);
      ctx.session.me = this._parseConsentMe(ctx);
      ctx.session.profile = await this._fetchConsentProfileData(ctx);
      ctx.session.tokenLifespan = this._parseLifespan(ctx, 'expires', 'expires-seconds');
      if (ctx.session.tokenLifespan) {
        ctx.session.refreshLifespan = this._parseLifespan(ctx, 'refresh', 'refresh-seconds');
      }
    }

    if (ctx.session.error) {
      this.logger.debug(_scope, 'invalid request, redirecting', { ctx });

      // Set all errors as parameters for client to interpret upon redirection.
      Manager._setSearchParams(ctx.session.redirectUri, {
        'state': ctx.session.state,
        'error': ctx.session.error,
        'error_description': ctx.session.errorDescriptions.join(', '),
      });
      res.statusCode = 302; // Found
      res.setHeader(Enum.Header.Location, ctx.session.redirectUri.href);
      res.end();
      this.logger.info(_scope, 'bad request, redirected', { ctx });
      return;
    }

    // Consented, off we go. Keep all this session state as the code.
    const code = await this.mysteryBox.pack({
      codeId: ctx.session.id,
      codeChallengeMethod: ctx.session.codeChallengeMethod,
      codeChallenge: ctx.session.codeChallenge,
      clientId: ctx.session.clientId.href,
      redirectUri: ctx.session.redirectUri.href,
      acceptedScopes: ctx.session.acceptedScopes,
      tokenLifespan: ctx.session.tokenLifespan,
      refreshLifespan: ctx.session.refreshLifespan,
      me: ctx.session.me.href,
      profile: ctx.session.profile,
      identifier: ctx.session.authenticatedIdentifier, // need this to pair with profile
      minted: Date.now(),
    });
  
    Manager._setSearchParams(ctx.session.redirectUri, {
      'code': code,
      'state': ctx.session.state,
      'iss': this.options.dingus.selfBaseUrl,
    });
    res.statusCode = 302;
    res.setHeader(Enum.Header.Location, ctx.session.redirectUri.href);
    res.end();

    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * Redeem a code for a profile url, and maybe more profile info.
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async postAuthorization(res, ctx) {
    const _scope = _fileScope('postAuthorization');
    this.logger.debug(_scope, 'called', { ctx });

    await this._ingestPostAuthorizationRequest(ctx);

    const response = {
      me: ctx.session.me,
      ...(ctx.session?.acceptedScopes?.includes('profile') && { profile: ctx.session.profile }),
      scope: ctx.session.acceptedScopes,
    };
    if (response.profile && !ctx.session?.acceptedScopes?.includes('email')) {
      delete response.profile.email;
    }

    if (!ctx.session.error) {
      await this.db.context(async (dbCtx) => {
        // Record code redemption without token.
        const valid = await this.db.redeemCode(dbCtx, {
          codeId: ctx.session.codeId,
          created: new Date(),
          isToken: false,
          clientId: ctx.session.clientId.href,
          profile: ctx.session.me,
          identifier: ctx.session.identifier,
          scopes: ctx.session.acceptedScopes,
          lifespanSeconds: Math.ceil(this.options.manager.codeValidityTimeoutMs / 1000),
          profileData: response.profile,
        });
        if (!valid) {
          this.logger.debug(_scope, 'code already redeemed', { ctx });
          Manager._setError(ctx, 'access_denied', 'code already redeemed');
        }
      }); // dbCtx
    }

    if (ctx.session.error) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        'error': ctx.session.error,
        'error_description': ctx.session.errorDescriptions.join(', '),
      }));
      this.logger.info(_scope, 'invalid request', { ctx });
      return;
    }

    res.end(JSON.stringify(response));

    this.logger.info(_scope, 'finished', { ctx, response });
  }


  /**
   * Ingest an incoming authorization redemption request, parsing fields
   * onto a new session object on the context.
   * @param {*} dbCtx
   * @param {Object} ctx
   */
  async _ingestPostAuthorizationRequest(ctx) {
    const _scope = _fileScope('_ingestPostAuthorizationRequest');

    ctx.session = Object.assign({}, ctx.session, {
      errorDescriptions: [],
    });

    if (!ctx.parsedBody) {
      this.logger.debug(_scope, 'no body data', { ctx });
      Manager._setError(ctx, 'invalid_request', 'missing data');
    }

    await this._restoreSessionFromCode(ctx);
    this._checkSessionMatchingClientId(ctx);
    this._checkSessionMatchingRedirectUri(ctx);
    this._checkGrantType(ctx);
    this._checkSessionMatchingCodeVerifier(ctx);

    if (!ctx.session.me || !ctx.session.minted) {
      this.logger.debug(_scope, 'session missing fields', { ctx });
      Manager._setError(ctx, 'invalid_request', 'malformed code');
      return;
    }

    const expires = new Date(ctx.session.minted + this.options.manager.codeValidityTimeoutMs);
    const now = new Date();
    if (expires < now) {
      this.logger.debug(_scope, 'code expired', { ctx });
      Manager._setError(ctx, 'invalid_request', 'code has expired');
    }
  }


  /**
   * Unpack the session data from provided code overtop of context session ..
   * @param {Object} ctx
   */
  async _restoreSessionFromCode(ctx) {
    const _scope = _fileScope('_restoreSessionFromCode');

    const code = ctx.parsedBody['code'];
    if (code) {
      try {
        const oldSession = await this.mysteryBox.unpack(code);

        // TODO: Validate unpacked fields better
        const missingFields = [
          'codeId',
          'codeChallengeMethod',
          'codeChallenge',
          'clientId',
          'redirectUri',
          'acceptedScopes',
          'me',
          'profile',
          'identifier',
          'minted',
        ].filter((requiredField) => !(requiredField in oldSession));
        if (missingFields.length) {
          if (this.options.manager.allowLegacyNonPKCE
          &&  missingFields.length === 2
          &&  missingFields.includes('codeChallenge')
          &&  missingFields.includes('codeChallengeMethod')) {
            this.logger.debug(_scope, 'allowing legacy non-PKCE session', { ctx });
          } else {
            this.logger.debug(_scope, 'unpacked code is missing required field', { missingFields, ctx });
            Manager._setError(ctx, 'invalid_request', 'code is not valid');
          }
        }

        Object.assign(ctx.session, oldSession);
      } catch (e) {
        this.logger.debug(_scope, 'failed to parse code', { error: e, ctx });
        Manager._setError(ctx, 'invalid_request', 'code is not valid');
      }
    } else {
      Manager._setError(ctx, 'invalid_request', 'missing required parameter \'code\'');
    }
  }


  /**
   * Ensure provided client_id matches session clientId.
   * @param {Object} ctx
   */
  _checkSessionMatchingClientId(ctx) {
    const _scope = _fileScope('_checkSessionMatchingClientId');

    let clientId = ctx.parsedBody['client_id'];
    if (clientId) {
      try {
        clientId = new URL(clientId);
        ctx.session.clientId = new URL(ctx.session.clientId);
      } catch (e) {
        this.logger.debug(_scope, 'un-parsable client_id url', { ctx });
        delete ctx.session.clientId;
        Manager._setError(ctx, 'invalid_request', 'malformed client_id');
        return;
      }
      if (clientId.href !== ctx.session.clientId.href) {
        this.logger.debug(_scope, 'clientId mismatched', { clientId, ctx });
        delete ctx.session.clientId;
        Manager._setError(ctx, 'invalid_request', 'code does not belong to that client_id');
      }
    } else {
      Manager._setError(ctx, 'invalid_request', 'missing required parameter \'client_id\'');
    }
  }


  /**
   * @param {Object} ctx
   */
  _checkSessionMatchingRedirectUri(ctx) {
    const _scope = _fileScope('_checkSessionMatchingClientId');

    let redirectUri = ctx.parsedBody['redirect_uri'];
    if (redirectUri) {
      try {
        redirectUri = new URL(redirectUri);
        ctx.session.redirectUri = new URL(ctx.session.redirectUri);
      } catch (e) {
        this.logger.debug(_scope, 'un-parsable redirect_uri url', { ctx });
        delete ctx.session.redirectUri;
        Manager._setError(ctx, 'invalid_request', 'malformed redirect_url');
        return;
      }
      if (redirectUri.href !== ctx.session.redirectUri.href) {
        this.logger.debug(_scope, 'redirectUri mismatched', { redirectUri, ctx });
        delete ctx.session.redirectUri;
        Manager._setError(ctx, 'invalid_request', 'code does not belong to that redirect_uri');
      }
    } else {
      Manager._setError(ctx, 'invalid_request', 'missing required parameter \'redirect_uri\'');
    }
  }


  /**
   * Validate grant_type, either persist on session or set error.
   * @param {Object} ctx
   * @param {String[]} validGrantTypes
   * @param {Boolean} treatEmptyAs
   */
  _checkGrantType(ctx, validGrantTypes = ['authorization_code'], treatEmptyAs = 'authorization_code') {
    const _scope = _fileScope('_checkGrantType');

    const grantType = ctx.parsedBody['grant_type'] || treatEmptyAs;
    if (!ctx.parsedBody['grant_type'] && treatEmptyAs) {
      this.logger.debug(_scope, `missing grant_type, treating as ${treatEmptyAs}`, { ctx });
    }
    if (validGrantTypes.includes(grantType)) {
      ctx.session.grantType = grantType;
    } else {
      Manager._setError(ctx, 'invalid_request', 'grant_type not supported');
    }
  }


  /**
   * @param {Object} ctx
   */
  _checkSessionMatchingCodeVerifier(ctx) {
    const _scope = _fileScope('_checkSessionMatchingCodeVerifier');

    const codeVerifier = ctx.parsedBody['code_verifier'];
    if (codeVerifier) {
      try {
        const valid = Communication.verifyChallenge(ctx.session.codeChallenge, codeVerifier, ctx.session.codeChallengeMethod);
        if (!valid) {
          this.logger.debug(_scope, 'challenge mismatched', { ctx });
          Manager._setError(ctx, 'invalid_request', 'challenge verification failed');
        }
      } catch (e) /* istanbul ignore next */ {
        this.logger.error(_scope, 'challenge validation failed', { error: e, ctx });
        Manager._setError(ctx, 'invalid_request', 'challenge verification failed');
      }
    } else {
      if (this.options.manager.allowLegacyNonPKCE
      &&  !ctx.session.codeChallenge
      &&  !ctx.session.codeChallengeMethod) {
        this.logger.debug(_scope, 'allowing non-PKCE', { ctx });
        return;
      }
      Manager._setError(ctx, 'invalid_request', 'missing required parameter \'code_verifier\'');
    }
  }


  /**
   * Attempt to revoke a token.
   * @param {*} dbCtx
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async _revokeToken(dbCtx, res, ctx) {
    const _scope = _fileScope('_revokeToken');
    try {
      const token = ctx.parsedBody['token'];
      const tokenTypeHint = ctx.parsedBody['token_type_hint'];
      switch (tokenTypeHint) {
        case undefined:
          break;
        case 'access_token':
          break;
        case 'refresh_token':
          break;
        default:
          this.logger.debug(_scope, 'unknown token_type_hint', { ctx });
      }
      if (!token) {
        throw new ValidationError('Token Missing');
      }
      ctx.token = await this.mysteryBox.unpack(token);
      if (!(ctx.token?.c || ctx.token?.rc)) {
        throw new ValidationError('Token Invalid');
      }
    } catch (e) {
      this.logger.debug(_scope, 'invalid token', { error: e, ctx });
      res.statusCode = 400;
      res.end();
      this.logger.info(_scope, 'finished, revoke request not valid', { error: e, ctx });
      return;
    }

    try {
      if (ctx.token.c) {
        await this.db.tokenRevokeByCodeId(dbCtx, ctx.token.c);
      } else {
        await this.db.tokenRefreshRevokeByCodeId(dbCtx, ctx.token.rc);
      }
    } catch (e) {
      if (e instanceof DBErrors.UnexpectedResult) {
        res.statusCode = 404;
        res.end();
        this.logger.info(_scope, 'finished, no token to revoke', { error: e, ctx });
        return;
      }
      this.logger.error(_scope, 'revoke token failed', { error: e, ctx });
      throw e;
    }

    res.end();
    this.logger.info(_scope, 'finished, token revoked', { ctx });
  }


  /**
   * Legacy token validation flow.
   * @param {*} dbCtx
   * @param {http.ClientRequest} req 
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async _validateToken(dbCtx, req, res, ctx) {
    const _scope = _fileScope('_validateToken');
    await this._checkTokenValidationRequest(dbCtx, req, ctx);
    if (ctx.bearer.isValid) {
      Manager._sensitiveResponse(res);
      res.end(JSON.stringify({
        me: ctx.token.profile,
        'client_id': ctx.token.clientId,
        scope: ctx.token.scopes,
      }));
      this.logger.info(_scope, 'finished, token validated', { ctx });
    } else {
      const responseErrorParts = ['Bearer'];
      const error = ctx.session.error ? `error="${ctx.session.error}"` : '';
      if (error) {
        responseErrorParts.push(error);
      }
      const errorDescription = ctx.session.errorDescriptions ? `error_description="${ctx.session.errorDescriptions.join(', ')}"` : '';
      if (errorDescription) {
        responseErrorParts.push(errorDescription);
      }
      res.setHeader(Enum.Header.WWWAuthenticate, responseErrorParts.join(', '));
      this.logger.info(_scope, 'finished, token not validated', { ctx });
      throw new ResponseError(Enum.ErrorResponse.Unauthorized);
    }
  }


  /**
   * Given a list of newly-requested scopes, return a list of scopes
   * from previousScopes which are not in requestedScopes.
   * @param {String[]} previousScopes
   * @param {String[]} requestedScopes
   * @returns {String[]}
   */
  static _scopeDifference(previousScopes, requestedScopes) {
    const scopesToRemove = [];
    const existingScopesSet = new Set(previousScopes);
    const validRequestedScopes = requestedScopes.filter((s) => common.validScope(s));
    const requestedScopesSet = new Set(validRequestedScopes);
    existingScopesSet.forEach((s) => {
      if (!requestedScopesSet.has(s)) {
        scopesToRemove.push(s);
      }
    });
    return scopesToRemove;
  }


  /**
   * Redeem a refresh token for a new token.
   * @param {*} dbCtx
   * @param {http.ClientRequest} req 
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async _refreshToken(dbCtx, req, res, ctx) {
    const _scope = _fileScope('_refreshToken');
    this.logger.debug(_scope, 'called', { ctx });

    const {
      'client_id': clientId,
      scope,
    } = ctx.parsedBody;

    try {
      ctx.refreshToken = await this.mysteryBox.unpack(ctx.parsedBody['refresh_token']);
    } catch (e) {
      this.logger.debug(_scope, 'failed to unpack token', { error: e, ctx });
    }

    const now = new Date();
    const nowEpoch = common.dateToEpoch(now);

    await this.db.transaction(dbCtx, async (txCtx) => {
      if (ctx.refreshToken?.rc) {
        ctx.token = await this.db.tokenGetByCodeId(txCtx, ctx.refreshToken.rc);
      }

      if (!ctx.token) {
        this.logger.debug(_scope, 'no token to refresh', { ctx });
        throw new ResponseError(Enum.ErrorResponse.NotFound);
      }

      if (!ctx.token.refreshExpires
      ||  ctx.token.refreshExpires < now) {
        this.logger.debug(_scope, 'token not refreshable or refresh expired', { ctx });
        throw new ResponseError(Enum.ErrorResponse.BadRequest);
      }

      const refreshExpiresEpoch = common.dateToEpoch(ctx.token.refreshExpires);
      if (ctx.refreshToken.exp < refreshExpiresEpoch) {
        this.logger.debug(_scope, 'token already refreshed', { ctx });
        throw new ResponseError(Enum.ErrorResponse.BadRequest);
      }

      if (clientId !== ctx.token.clientId) {
        this.logger.debug(_scope, 'client identifier mismatch', { ctx });
        throw new ResponseError(Enum.ErrorResponse.BadRequest);
      }

      const scopesToRemove = scope ? Manager._scopeDifference(ctx.token.scopes, scope.split(scopeSplitRE)) : [];
      if (scopesToRemove.length) {
        this.logger.debug(_scope, 'scope reduction requested', { ctx, scopesToRemove });
      }
  
      const refreshedTokenData = await this.db.refreshCode(txCtx, ctx.refreshToken.rc, now, scopesToRemove);
      if (refreshedTokenData) {
        Object.assign(ctx.token, refreshedTokenData);
      } else {
        this.logger.debug(_scope, 'could not refresh token', { ctx });
        throw new ResponseError(Enum.ErrorResponse.NotFound);
      }
    }); // tx

    const [token, refreshToken] = await Promise.all([
      {
        c: ctx.token.codeId,
        ts: nowEpoch,
      },
      {
        rc: ctx.token.codeId,
        ts: nowEpoch,
        exp: nowEpoch + ctx.token.refreshDuration,
      },
    ].map(this.mysteryBox.pack));

    const response = {
      'access_token': token,
      'token_type': 'Bearer',
      ...(ctx.token.duration && { 'expires_in': nowEpoch + ctx.token.duration }),
      ...(refreshToken && { 'refresh_token': refreshToken }),
      scope: ctx.token.scopes.join(' '),
      me: ctx.session.me,
      ...(ctx.token.scopes.includes('profile') && { profile: ctx.token.profileData }),
    };
    if (ctx.token.scopes.includes('profile') && !ctx.token.scopes.includes('email')) {
      delete response?.profile?.email;
    }

    Manager._sensitiveResponse(res);
    res.end(JSON.stringify(response));
    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * Generate a new ticket for later redemption.
   * @param {Object} payload
   * @param {} payload.subject deliver ticket to this endpoint
   * @param {} payload.resource url the redeemed ticket is valid for accessing
   * @param {String[]} payload.scopes list of scopes assigned to ticket
   * @param {String} payload.identifier user generating ticket
   * @param {} payload.profile profile of user generating ticket
   * @param {Number} payload.ticketLifespanSeconds ticket redeemable for this long
   * @returns {String}
  */
  async _mintTicket({ subject, resource, scopes, identifier, profile, ticketLifespanSeconds }) {
    const _scope = _fileScope('_mintTicket');
    this.logger.debug(_scope, 'called', { subject, resource, scopes, identifier, profile, ticketLifespanSeconds });

    const nowEpoch = common.dateToEpoch();
    return this.mysteryBox.pack({
      c: common.requestId(),
      iss: nowEpoch,
      exp: nowEpoch + ticketLifespanSeconds,
      sub: subject,
      res: resource,
      scope: scopes,
      ident: identifier,
      profile: profile,
    });
  }


  /**
   * @typedef Ticket
   * @property {String} codeId
   * @property {Date} issued
   * @property {Date} expires
   * @property {URL} subject
   * @property {URL} resource
   * @property {String[]} scopes
   * @property {String} identifier
   * @property {URL} profile
   */
  /**
   * 
   * @param {String} ticket
   * @returns {Ticket}
   */
  async _unpackTicket(ticket) {
    const ticketObj = await this.mysteryBox.unpack(ticket);
    return {
      codeId: ticketObj.c,
      issued: new Date(ticketObj.iss * 1000),
      expires: new Date(ticketObj.exp * 1000),
      subject: new URL(ticketObj.sub),
      resource: new URL(ticketObj.res),
      scopes: ticketObj.scope,
      identifier: ticketObj.ident,
      profile: new URL(ticketObj.profile),
    };
  }


  /**
   * Redeem a ticket for a token.
   * @param {*} dbCtx
   * @param {http.ClientRequest} req 
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async _ticketAuthToken(dbCtx, req, res, ctx) {
    const _scope = _fileScope('_ticketAuthToken');
    this.logger.debug(_scope, 'called', { ctx });

    try {
      ctx.ticket = await this._unpackTicket(ctx.parsedBody['ticket']);
    } catch (e) {
      this.logger.debug(_scope, 'failed to unpack ticket', { error: e, ctx });
      throw new ResponseError(Enum.ErrorResponse.BadRequest);
    }

    const now = new Date();
    if (now > ctx.ticket.expires) {
      this.logger.debug(_scope, 'ticket has expired', { ctx });
      throw new ResponseError(Enum.ErrorResponse.Forbidden, { reason: 'Ticket has expired.', expired: ctx.ticket.expires });
    }

    const nowEpoch = common.dateToEpoch(now);
    const token = await this.mysteryBox.pack({
      c: ctx.ticket.codeId,
      ts: nowEpoch,
    });

    const response = {
      'access_token': token,
      'token_type': 'Bearer',
      scope: ctx.ticket.scopes.join(' '),
      me: ctx.ticket.profile.href,
    };

    const isValid = await this.db.redeemCode(dbCtx, {
      created: now,
      codeId: ctx.ticket.codeId,
      isToken: true,
      clientId: ctx.ticket.subject.href,
      resource: ctx.ticket.resource.href,
      profile: ctx.ticket.profile.href,
      identifier: ctx.ticket.identifier,
      scopes: ctx.ticket.scopes,
    });
    if (!isValid) {
      this.logger.debug(_scope, 'redemption failed, already redeemed', { ctx });
      throw new ResponseError(Enum.ErrorResponse.Forbidden);
    }

    Manager._sensitiveResponse(res);
    res.end(JSON.stringify(response));
    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * Redeem a code for a token.
   * @param {*} dbCtx
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async _codeToken(dbCtx, req, res, ctx) {
    const _scope = _fileScope('_codeToken');
    this.logger.debug(_scope, 'called', { ctx });

    await this._restoreSessionFromCode(ctx);
    await this._checkSessionMatchingRedirectUri(ctx);

    if (ctx.session.error) {
      throw new ResponseError(Enum.ErrorResponse.BadRequest);
    }

    /**
     * Note the creation date here rather than in database, so that stored
     * expire dates are ensured to match those packed in tokens.
     * An alternative would be to return the date generated by the database,
     * but then we would need to hold the transaction open while minting the
     * tokens to ensure success.  Perhaps that would be worth it, but for now
     * this is how it is.
     */
    const now = new Date();
    const nowEpoch = common.dateToEpoch(now);
    const tokenMinters = [];

    tokenMinters.push(this.mysteryBox.pack({
      c: ctx.session.codeId,
      ts: nowEpoch,
      ...(ctx.session.tokenLifespan && { exp: nowEpoch + ctx.session.tokenLifespan }),
    }));

    if (ctx.session.tokenLifespan
    &&  ctx.session.refreshLifespan) {
      tokenMinters.push(this.mysteryBox.pack({
        rc: ctx.session.codeId,
        ts: nowEpoch,
        exp: nowEpoch + ctx.session.refreshLifespan,
      }));
    }

    const [token, refreshToken] = await Promise.all(tokenMinters);

    const response = {
      'access_token': token,
      'token_type': 'Bearer',
      ...(ctx.session.tokenLifespan && { 'expires_in': nowEpoch + ctx.session.tokenLifespan }),
      ...(refreshToken && { 'refresh_token': refreshToken }),
      scope: ctx.session.acceptedScopes.join(' '),
      me: ctx.session.me,
      ...(ctx.session.acceptedScopes.includes('profile') && { profile: ctx.session.profile }),
    };
    if (!ctx.session.acceptedScopes.includes('email') && response.profile) {
      delete response.profile.email;
    }

    const isValid = await this.db.redeemCode(dbCtx, {
      created: now,
      codeId: ctx.session.codeId,
      isToken: true,
      clientId: ctx.session.clientId,
      profile: ctx.session.me,
      identifier: ctx.session.identifier,
      scopes: ctx.session.acceptedScopes,
      lifespanSeconds: ctx.session.tokenLifespan,
      refreshLifespanSeconds: ctx.session.refreshLifespan,
      profileData: response.profile,
    });
    if (!isValid) {
      this.logger.debug(_scope, 'redemption failed, already redeemed', { ctx });
      throw new ResponseError(Enum.ErrorResponse.Forbidden);
    }

    Manager._sensitiveResponse(res);
    res.end(JSON.stringify(response));
    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * Issue, refresh, or validate a token.
   * @param {http.ClientRequest} req 
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async postToken(req, res, ctx) {
    const _scope = _fileScope('postToken');
    this.logger.debug(_scope, 'called', { ctx });

    ctx.session = Object.assign({}, ctx.session);

    await this.db.context(async (dbCtx) => {

      // Is this a (legacy) revocation request?
      if (ctx.parsedBody['action'] === 'revoke') {
        await this._revokeToken(dbCtx, res, ctx);
        return;
      }

      // Is this a (legacy) token validation request?
      if (req.getHeader(Enum.Header.Authorization)) {
        await this._validateToken(dbCtx, res, ctx);
        return;
      }

      const validGrantTypes = [
        'authorization_code',
        'refresh_token',
        ...(this.queuePublisher && ['ticket'] || []),
      ];
      this._checkGrantType(ctx, validGrantTypes, 'authorization_code');

      switch (ctx.session.grantType) {
        case 'refresh_token':
          return this._refreshToken(dbCtx, req, res, ctx);

        case 'ticket':
          return this._ticketAuthToken(dbCtx, req, res, ctx);

        case 'authorization_code':
          return this._codeToken(dbCtx, req, res, ctx);

        default:
          this.logger.debug(_scope, 'unknown grant_type', { ctx });
          Manager._setError(ctx, 'invalid_request', 'grant_type not supported');
      }

      // Only way of getting here is due to error.
      throw new ResponseError(Enum.ErrorResponse.BadRequest);
    }); // dbCtx
  }


  /**
   * Ingest token from authorization header, setting ctx.bearer.isValid appropriately.
   * ctx.bearer not set if auth method not recognized.
   * This is for legacy validation on token endpoint.
   * @param {*} dbCtx
   * @param {http.ClientRequest} req
   * @param {Object} ctx
   */
  async _checkTokenValidationRequest(dbCtx, req, ctx) {
    const _scope = _fileScope('_checkTokenValidationRequest');
    const authHeader = req.getHeader(Enum.Header.Authorization);

    if (authHeader) {
      const [authMethod, authString] = common.splitFirst(authHeader, ' ', '');
      switch (authMethod.toLowerCase()) { // eslint-disable-line sonarjs/no-small-switch
        case 'bearer': {
          ctx.bearer = {
            isValid: false,
          };  
          try {
            Object.assign(ctx.bearer, await this.mysteryBox.unpack(authString));
          } catch (e) {
            this.logger.debug(_scope, 'failed to unpack token', { ctx });
            Manager._setError(ctx, 'invalid_request', 'invalid token');
            return;
          }
          if (!ctx.bearer.c) {
            this.logger.debug(_scope, 'incomplete token', { ctx });
            Manager._setError(ctx, 'invalid_request', 'invalid token');
            return;
          }

          try {
            ctx.token = await this.db.tokenGetByCodeId(dbCtx, ctx.bearer.c);
          } catch (e) {
            this.logger.error(_scope, 'failed to look up token', { error: e, ctx });
            throw e;
          }

          if (!ctx.token) {
            this.logger.debug(_scope, 'no token found', { ctx });
            Manager._setError(ctx, 'invalid_request', 'invalid token');
            return;
          }

          if (!ctx.token.isRevoked
          &&  ctx.token.expires > new Date()) {
            ctx.bearer.isValid = true;
          }
          break;
        }

        default:
          this.logger.debug(_scope, 'unknown authorization scheme', { ctx });
          return;
      }
    }
  }


  /**
   * Accept an unsolicited ticket proffering.
   * @param {http.ClientRequest} req 
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async postTicket(req, res, ctx) {
    const _scope = _fileScope('postTicket');
    this.logger.debug(_scope, 'called', { ctx });

    if (!this.queuePublisher) {
      this.logger.debug(_scope, 'ticket endpoint not configured', { ctx });
      throw new ResponseError(Enum.ErrorResponse.BadRequest);
    }

    const queueName = this.options.queues.ticketPublishName;
    const { ticket, resource, subject } = ctx.parsedBody;
    
    try {
      new URL(resource);
    } catch (e) {
      this.logger.debug(_scope, 'unparsable resource', { ticket, resource, subject, ctx });
      throw new ResponseError(Enum.ErrorResponse.BadRequest);
    }

    await this.db.context(async (dbCtx) => {
      const isValidProfile = await this.db.profileIsValid(dbCtx, subject);
      if (!isValidProfile) {
        this.logger.debug(_scope, 'invalid subject', { ticket, resource, subject, ctx });
        throw new ResponseError(Enum.ErrorResponse.NotFound, { error: 'subject not under our purview' });
      }

      try {
        const result = await this.queuePublisher.publish(queueName, { ticket, resource, subject });
        this.logger.debug(_scope, 'accepted ticket offer', { queueName, ticket, resource, subject, ctx, result });
      } catch (e) {
        this.logger.error(_scope, 'failed to publish ticket to queue', { error: e, queueName, ticket, resource, subject, ctx });
        throw e; // return a 500
      }

      res.statusCode = 202;
      res.end();
      this.logger.info(_scope, 'finished', { resource, subject, ctx });
    });
  }


  /**
   * Validate a token and return data about it.
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async postIntrospection(res, ctx) {
    const _scope = _fileScope('postIntrospection');
    this.logger.debug(_scope, 'called', { ctx });

    let response = {
      active: false,
    };

    const tokenIsTicket = (ctx.parsedBody['token_hint_type'] || '').toLowerCase() === 'ticket';

    try {
      const token = ctx.parsedBody['token'];
      if (tokenIsTicket) {
        ctx.token = await this._unpackTicket(token);
      } else {
        ctx.token = await this.mysteryBox.unpack(token);
      }
    } catch (e) {
      this.logger.debug(_scope, 'failed to unpack token', { error: e, ctx });
    }

    if (ctx.token
    &&  !tokenIsTicket) {
      await this.db.context(async (dbCtx) => {
        ctx.token = await this.db.tokenGetByCodeId(dbCtx, ctx.token.c);
      }); // dbCtx
    }

    if (ctx.token
    &&  !ctx.token.isRevoked) {
      // fuss around for postgres 'Infinity' date
      const expiresMs = (ctx.token.expires instanceof Date) ? ctx.token.expires.getTime() : ctx.token.expires;
      if (expiresMs > Date.now()) {
        response = {
          active: true,
          me: ctx.token.profile,
          ...(ctx.token.clientId && { 'client_id': ctx.token.clientId }),
          scope: ctx.token.scopes.join(' '),
          iat: common.dateToEpoch(ctx.token.created || ctx.token.issued),
          ...(isFinite(expiresMs) && { exp: Math.ceil(expiresMs / 1000) }),
          ...(tokenIsTicket && { 'token_type': 'ticket' }),
        };
      }
    }

    Manager._sensitiveResponse(res);
    res.end(JSON.stringify(response));
    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * Revoke a token or refresh token.
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async postRevocation(res, ctx) {
    const _scope = _fileScope('postRevocation');
    this.logger.debug(_scope, 'called', { ctx });

    try {
      await this.db.context(async (dbCtx) => {
        await this._revokeToken(dbCtx, res, ctx);
      });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, ctx });
      throw e;
    }

    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * Profile information for a token.
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async postUserInfo(res, ctx) {
    const _scope = _fileScope('postUserInfo');
    this.logger.debug(_scope, 'called', { ctx });

    const token = ctx.parsedBody['token'];
    if (!token) {
      res.statusCode = 400;
      res.end('"invalid_request"');
      this.logger.info(_scope, 'finished, invalid request', { ctx });
      return;
    }

    try {
      ctx.token = await this.mysteryBox.unpack(ctx.parsedBody['token']);
    } catch (e) {
      this.logger.debug(_scope, 'failed to unpack token', { error: e, ctx });
    }

    if (ctx.token) {
      await this.db.context(async (dbCtx) => {
        ctx.token = await this.db.tokenGetByCodeId(dbCtx, ctx.token.c);
      }); // dbCtx
    }
  
    if (!ctx.token
    ||  ctx.token.isRevoked
    // || tokenIsExpired(token)
    ) {
      res.statusCode = 401;
      res.end('"invalid_token"');
      this.logger.info(_scope, 'finished, invalid token', { ctx });
      return;
    }

    if (!ctx.token.scopes.includes('profile')) {
      res.statusCode = 403;
      res.end('"insufficient_scope"');
      this.logger.info(_scope, 'finished, insufficient scope', { ctx });
      return;
    }

    const response = {
      ...ctx.token.profile,
    };
    if (!ctx.token.scopes.includes('email')) {
      delete response.email;
    }

    Manager._sensitiveResponse(res);
    res.end(JSON.stringify(response));

    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * Show admin interface, allowing manipulation of profiles and scopes.
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async getAdmin(res, ctx) {
    const _scope = _fileScope('getAdmin');
    this.logger.debug(_scope, 'called', { ctx });

    const identifier = ctx.session.authenticatedIdentifier;

    await this.db.context(async (dbCtx) => {
      ctx.profilesScopes = await this.db.profilesScopesByIdentifier(dbCtx, identifier);
      ctx.tokens = await this.db.tokensGetByIdentifier(dbCtx, identifier);
    }); // dbCtx

    res.end(Template.adminHTML(ctx, this.options));

    this.logger.info(_scope, 'finished', { ctx });
  }

  
  /**
   * Process admin interface events.
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async postAdmin(res, ctx) {
    const _scope = _fileScope('postAdmin');
    this.logger.debug(_scope, 'called', { ctx });

    await this.db.context(async (dbCtx) => {
      const identifier = ctx.session.authenticatedIdentifier;
      const action = ctx?.parsedBody?.['action'] || '';

      if (action === 'save-scopes') {
        // Update the convenience scopes set for profiles.
        // Expect 'scopes-<profile>' with value of array of scopes
        const profileKeys = ctx.parsedBody && Object.keys(ctx.parsedBody)
          .filter((k) => k.startsWith('scopes-'));
        try {
          await this.db.transaction(dbCtx, async (txCtx) => {
            await Promise.all(
              /* For each scopes-profile submitted, set those. */
              profileKeys.map((profileKey) => {
                /* elide 'scope-' prefix to get the profile */
                const profile = profileKey.slice(7);
                /* (should validate profile here) */

                /* remove invalid scopes from submitted list */
                const scopes = ctx.parsedBody[profileKey].filter((scope) => scope && common.validScope(scope)); // eslint-disable-line security/detect-object-injection
                return this.db.profileScopesSetAll(txCtx, profile, scopes);
              }),
            );
          }); // txCtx
          ctx.notifications.push('Profile/Scope Availability Matrix updated!');
        } catch (e) {
          this.logger.error(_scope, 'did not set profile scopes', { error: e, ctx });
          ctx.errors.push('Failed to update profile scopes.');
        }

      } else if (action === 'new-profile') {
        // Validate and create a new profile uri.
        let profile;
        const profileUri = ctx.parsedBody['profile'];
        try {
          profile = await this.communication.validateProfile(profileUri);
        } catch (e) {
          this.logger.debug(_scope, 'invalid profile url', { error: e, ctx });
          ctx.errors.push(`'${profileUri}' is not a valid profile URI.${(e instanceof CommunicationErrors.ValidationError) ? ('(' + e.message + ')') : ''}`);
        }
        if (profile) {
          // Validate profile uri
          const profileData = await this.communication.fetchProfile(profile);
          if (profileData.metadata.authorizationEndpoint !== this.selfAuthorizationEndpoint) {
            this.logger.debug(_scope, 'profile does not list this server as auth', { profileData, ctx });
            ctx.errors.push('Requested profile does not list this service, not adding.');
          } else {
            try {
              await this.db.transaction(dbCtx, async (txCtx) => {
                await this.db.profileIdentifierInsert(txCtx, profile.href, identifier);
                await this.db.profileScopesSetAll(txCtx, profile.href, ['profile', 'email']);
              }); // txCtx
              ctx.notifications.push('Profile added!');
            } catch (e) {
              this.logger.error(_scope, 'did not insert profile', { error: e, ctx });
              ctx.errors.push('Failed to add profile.');
            }
          }
        }

      } else if (action === 'new-scope') {
        // Add or update a manually-added convenience scope.
        const { scope, application = '', description = '' } = ctx.parsedBody;
        if (scope) {
          if (!common.validScope(scope)) {
            ctx.errors.push(`"${scope}" is not a valid scope name, did not add it.`);
          } else {
            try {
              await this.db.scopeUpsert(dbCtx, scope, application, description, true);
              ctx.notifications.push('Scope List updated!');
            } catch (e) {
              this.logger.error(_scope, 'did not upsert scope', { error: e, scope, application, description, ctx });
              ctx.errors.push('Failed to update scope.');
            }
          }
        }

      } else if (action.startsWith('delete-scope-')) {
        // Remove a manually-added convenience scope.
        const scope = decodeURIComponent(action.slice(13));
        if (scope) {
          try {
            const deleted = await this.db.scopeDelete(dbCtx, scope);
            if (deleted) {
              ctx.notifications.push('Scope deleted.');
            } else {
              ctx.notifications.push('Unable to delete scope.');
            }
          } catch (e) {
            this.logger.error(_scope, 'did not delete scope', { error: e, scope, ctx });
            ctx.errors.push('Failed to delete scope.');
          }
        }

      } else if (action.startsWith('revoke-')) {
        // Revoke an active token.
        const codeId = action.slice(8);
        if (codeId) {
          try {
            await this.db.tokenRevokeByCodeId(dbCtx, codeId, identifier);
            ctx.notifications.push('Revoked token!');
          } catch (e) {
            this.logger.error(_scope, 'did not revoke token', { error: e, codeId, identifier, ctx });
            ctx.errors.push('Unable to revoke token.');
          }
        }

      } else if (action) {
        ctx.errors.push(`Do not know how to '${action}'.`);
      }

      ctx.profilesScopes = await this.db.profilesScopesByIdentifier(dbCtx, identifier);
      ctx.tokens = await this.db.tokensGetByIdentifier(dbCtx, identifier);
    }); // dbCtx

    res.end(Template.adminHTML(ctx, this.options));

    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * Show ticket proffer interface.
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async getAdminTicket(res, ctx) {
    const _scope = _fileScope('getAdminTicket');
    this.logger.debug(_scope, 'called', { ctx });

    const identifier = ctx.session.authenticatedIdentifier;

    await this.db.context(async (dbCtx) => {
      ctx.profilesScopes = await this.db.profilesScopesByIdentifier(dbCtx, identifier);
      ctx.profiles = ctx.profilesScopes.profiles;
      ctx.scopes = Object.keys(ctx.profilesScopes.scopeIndex);
    }); // dbCtx

    res.end(Template.adminTicketHTML(ctx, this.options));

    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * Handle ticket proffer interface submission.
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async postAdminTicket(res, ctx) {
    const _scope = _fileScope('postAdminTicket');
    this.logger.debug(_scope, 'called', { ctx });

    switch (ctx.parsedBody['action']) { // eslint-disable-line sonarjs/no-small-switch
      case 'proffer-ticket': {
        const identifier = ctx.session.authenticatedIdentifier;
        [
          { ctxProp: 'ticketProfileUrl', bodyParam: 'profile', err: 'Invalid Profile URL selected.' },
          { ctxProp: 'ticketResourceUrl', bodyParam: 'resource', err: 'Invalid Resource URL.' },
          { ctxProp: 'ticketSubjectUrl', bodyParam: 'subject', err: 'Invalid Recipient URL.' },
        ].forEach((param) => {
          try {
            ctx[param.ctxProp] = new URL(ctx.parsedBody[param.bodyParam]);
          } catch (e) {
            this.logger.debug(_scope, `invalid ${param.bodyParam}`, { ctx });
            ctx.errors.push(param.err);
          }
        });

        const subjectData = await this.communication.fetchProfile(ctx.ticketSubjectUrl);
        if (!subjectData?.metadata?.ticketEndpoint) {
          this.logger.debug(_scope, 'subject has no ticket endpoint', { ctx });
          ctx.errors.push('Recipient does not list a ticket endpoint to deliver to.');
        } else {
          try {
            ctx.ticketEndpointUrl = new URL(subjectData.metadata.ticketEndpoint);
          } catch (e) {
            this.logger.debug(_scope, 'subject has invalid ticket endpoint', { error: e, ctx });
            ctx.errors.push(`Recipient lists an invalid ticket endpoint, cannot deliver. (${e})`);
          }
        }

        const scopesSet = new Set();
        const rawScopes = [
          ...(common.ensureArray(ctx.parsedBody['scopes'])),
          ...((ctx.parsedBody['adhoc'] || '').split(scopeSplitRE)),
        ].filter((scope) => scope);
        rawScopes.forEach((scope) => {
          if (common.validScope(scope)) {
            scopesSet.add(scope);
          } else {
            this.logger.debug(_scope, 'invalid adhoc scope', { scope, ctx });
            ctx.errors.push(`'${scope}' is not a valid scope.`);
          }
        });
        ctx.ticketScopes = [...scopesSet];
        const actionScopes = ctx.ticketScopes.filter((scope) => !['profile', 'email'].includes(scope));
        if (!actionScopes.length) {
          this.logger.debug(_scope, 'no valid scopes included', { ctx });
          ctx.errors.push('At least one actionable scope must be included.');
        }

        if (!ctx.errors.length) {
          const ticketData = {
            subject: ctx.ticketSubjectUrl.href,
            resource: ctx.ticketResourceUrl.href,
            scopes: ctx.ticketScopes,
            identifier,
            profile: ctx.ticketProfileUrl.href,
            ticketLifespanSeconds: this.options.manager.ticketLifespanSeconds,
          };
          const ticket = await this._mintTicket(ticketData);

          await this.db.context(async (dbCtx) => {
            // re-populate form fields
            ctx.profilesScopes = await this.db.profilesScopesByIdentifier(dbCtx, identifier);
      
            // TODO: queue ticket for delivery/retry to subject instead of trying immediately
            // ctx.notifications.push('Success! Ticket will be delivered!');

            this.logger.debug(_scope, 'ticket created', { ctx, ticketData, subjectData });

            try {
              const result = await this.communication.deliverTicket(ctx.ticketEndpointUrl, ctx.ticketResourceUrl, ctx.ticketSubjectUrl, ticket);
              ctx.notifications.push(`Success! Ticket was delivered. (${result?.statusText})`);
              this.logger.info(_scope, 'ticket delivered', { ctx, result });
            } catch (e) {
              this.logger.error(_scope, 'failed to deliver ticket', { ctx, error: e });
              ctx.errors.push(`Failed to deliver ticket. (${e})`);
            }

          }); // dbCtx

        } else {
          // populate form fields again
          await this.db.context(async (dbCtx) => {
            ctx.profilesScopes = await this.db.profilesScopesByIdentifier(dbCtx, identifier);
            ctx.scopes = Object.keys(ctx.profilesScopes.scopeIndex);      
          }); // dbCtx      
        }

        break;
      }

      default:
        this.logger.debug(_scope, 'unknown action', { ctx });
    }

    res.end(Template.adminTicketHTML(ctx, this.options));

    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * Report on generally uninteresting backend information.
   * Also allow a few event invocations.
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async getAdminMaintenance(res, ctx) {
    const _scope = _fileScope('getAdminMaintenance');
    this.logger.debug(_scope, 'called', { ctx });

    const maintenanceTasks = [];

    await this.db.context(async (dbCtx) => {

      Object.values(Enum.Chore).forEach((chore) => {
        if (chore in ctx.queryParams) {
          maintenanceTasks.push(
            this.chores.runChore(chore, 0), // Provide arg to force chore run.
          );
          ctx.notifications.push(`Running maintenance chore "${chore}".`);
        }
      });

      await Promise.all(maintenanceTasks);

      ctx.almanac = await this.db.almanacGetAll(dbCtx);
    }); // dbCtx

    const winnowChoreEntry = ([name, value]) => [name, common.pick(value, ['intervalMs', 'nextSchedule'])];
    ctx.chores = Object.fromEntries(
      Object.entries(this.chores.chores).map(winnowChoreEntry),
    );

    res.end(Template.adminMaintenanceHTML(ctx, this.options));

    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * 
   * @param {http.ServerResponse} res
   * @param {Object} ctx 
   */
  async getHealthcheck(res, ctx) {
    const _scope = _fileScope('getHealthcheck');
    this.logger.debug(_scope, 'called', { ctx });
    await this.db.healthCheck();
    res.end();
  }

}

module.exports = Manager;