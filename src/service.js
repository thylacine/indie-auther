'use strict';

/**
 * Here we extend the base API server to define our routes and any route-specific
 * behavior (middlewares) before handing off to the manager.
 */

const path = require('path');
const { Dingus } = require('@squeep/api-dingus');
const common = require('./common');
const Manager = require('./manager');
const { Authenticator, ResourceAuthenticator, SessionManager } = require('@squeep/authentication-module');
const { initContext, navLinks } = require('./template/template-helper');
const Enum = require('./enum');
const { ResponseError } = require('./errors');

const _fileScope = common.fileScope(__filename);

/**
 * @typedef {import('node:http')} http
 */

class Service extends Dingus {
  constructor(logger, db, options, asyncLocalStorage) {
    super(logger, {
      ...options.dingus,
      ignoreTrailingSlash: false,
    });
    this.options = options;
    this.asyncLocalStorage = asyncLocalStorage;
    this.staticPath = path.normalize(path.join(__dirname, '..', 'static'));
    this.manager = new Manager(logger, db, options);
    this.authenticator = new Authenticator(logger, db, options);
    this.sessionManager = new SessionManager(logger, this.authenticator, options);
    this.resourceAuthenticator = new ResourceAuthenticator(logger, db, options);
    this.loginPath = this._routeExternal('auth-login'); // eslint-disable-line sonarjs/no-duplicate-string

    // Service discovery
    this.on(['GET'], this._route('metadata'), this.handlerGetMeta.bind(this));
    // Also respond with metadata on well-known oauth2 endpoint if base has no prefix
    if ((options?.dingus?.selfBaseUrl?.match(/\//g) || []).length === 3) {
      this.on(['GET'], '/.well-known/oauth-authorization-server', this.handlerGetMeta.bind(this));
    }

    // Primary endpoints
    this.on(['GET'], this._route('authorization'), this.handlerGetAuthorization.bind(this));
    this.on(['POST'], this._route('authorization'), this.handlerPostAuthorization.bind(this));
    this.on(['POST'], this._route('consent'), this.handlerPostConsent.bind(this));
    this.on(['POST'], this._route('revocation'), this.handlerPostRevocation.bind(this));
    this.on(['POST'], this._route('ticket'), this.handlerPostTicket.bind(this));
    this.on(['POST'], this._route('token'), this.handlerPostToken.bind(this));

    // Resource endpoints
    this.on('POST', this._route('introspection'), this.handlerPostIntrospection.bind(this));
    this.on('POST', this._route('userinfo'), this.handlerPostUserInfo.bind(this));

    // Information page about service
    this.on(['GET'], '/', this.handlerGetRoot.bind(this));

    // Temmporary to see what rando payload someone is sending us unsolicited
    this.on(['POST'], '/', this.handlerWhaGwan.bind(this));

    // Give load-balancers something to check
    this.on(['GET'], this._route('healthcheck'), this.handlerGetHealthcheck.bind(this));

    // These routes are intended for accessing static content during development.
    // In production, a proxy server would likely handle these first.
    this.on(['GET'], this._route('static'), this.handlerRedirect.bind(this), `${options.dingus.proxyPrefix}/static/`);
    this.on(['GET'], this._route('static', ''), this.handlerGetStaticFile.bind(this), 'index.html');
    this.on(['GET'], this._route('static', ':file'), this.handlerGetStaticFile.bind(this));
    this.on(['GET'], '/favicon.ico', this.handlerGetStaticFile.bind(this), 'favicon.ico');
    this.on(['GET'], '/robots.txt', this.handlerGetStaticFile.bind(this), 'robots.txt');

    // Profile and token management for authenticated sessions
    this.on(['GET'], this._route('admin'), this.handlerRedirect.bind(this), `${options.dingus.proxyPrefix}/admin/`);
    this.on(['GET'], this._route('admin', ''), this.handlerGetAdmin.bind(this));
    this.on(['POST'], this._route('admin', ''), this.handlerPostAdmin.bind(this));

    // Ticket-proffering interface for authenticated sessions
    this.on(['GET'], this._route('admin-ticket'), this.handlerGetAdminTicket.bind(this));
    this.on(['POST'], this._route('admin-ticket'), this.handlerPostAdminTicket.bind(this));

    // User authentication and session establishment
    this.on(['GET'], this._route('auth-login'), this.handlerGetAdminLogin.bind(this));
    this.on(['POST'], this._route('auth-login'), this.handlerPostAdminLogin.bind(this));
    this.on(['GET'], this._route('auth-logout'), this.handlerGetAdminLogout.bind(this));
    this.on(['GET'], this._route('auth-settings'), this.handlerGetAdminSettings.bind(this));
    this.on(['POST'], this._route('auth-settings'), this.handlerPostAdminSettings.bind(this));

    // Page for upkeep info et cetera
    this.on(['GET'], this._route('admin-maintenance'), this.handlerGetAdminMaintenance.bind(this));

  }


  /**
   * Returns the configured route path for the given route name.
   * @param {string} r route name
   * @param {string=} t trailer to append to route
   * @returns {string} route path
   */
  _route(r, t) {
    return `/${this.options.route[r]}${t !== undefined ? '/' + t : ''}`; // eslint-disable-line security/detect-object-injection

  }


  /**
   * Returns the external route path for the given route name.
   * @param {string} r route name
   * @param {string=} t trailer to append to route
   * @returns {string} route path
   */
  _routeExternal(r, t) {
    return this.options.dingus.proxyPrefix + this._route(r, t);
  }


  /**
   * Perform any async startup tasks.
   */
  async initialize() {
    await this.manager.initialize();
  }


  /**
   * Do a little more on each request.
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async preHandler(req, res, ctx) {
    const _scope = _fileScope('preHandler');

    await super.preHandler(req, res, ctx);
    ctx.url = req.url; // Persist this for logout redirect

    const logObject = this.asyncLocalStorage.getStore();
    // istanbul ignore else
    if (logObject) { // Debugging in vscode seems to kill ALS, work around
      logObject.requestId = ctx.requestId;
      delete ctx.requestId;
    } else {
      this.logger.debug(_scope, 'no async local store');
    }
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetAdminLogin(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminLogin');
    this.logger.debug(_scope, 'called', { req, ctx });

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.sessionManager.getAdminLogin(res, ctx, navLinks);
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostAdminLogin(req, res, ctx) {
    const _scope = _fileScope('handlerPostAdminLogin');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.sessionManager.postAdminLogin(res, ctx, navLinks);
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetAdminSettings(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminSettings');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx)) {
      await this.sessionManager.getAdminSettings(res, ctx, navLinks);
    }
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostAdminSettings(req, res, ctx) {
    const _scope = _fileScope('handlerPostAdminSettings');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx)) {
      await this.ingestBody(req, res, ctx);
      await this.sessionManager.postAdminSettings(res, ctx, navLinks);
    }
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetAdminLogout(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminLogout');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.sessionManager.getAdminLogout(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetAdmin(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdmin');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx, this.loginPath)) {
      await this.manager.getAdmin(res, ctx);
    }
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostAdmin(req, res, ctx) {
    const _scope = _fileScope('handlerPostAdmin');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx, this.loginPath)) {
      await this.ingestBody(req, res, ctx);
      await this.manager.postAdmin(res, ctx);
    }
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetAdminTicket(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminTicket');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx, this.loginPath)) {
      await this.manager.getAdminTicket(res, ctx);
    }
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostAdminTicket(req, res, ctx) {
    const _scope = _fileScope('handlerPostAdminTicket');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx, this.loginPath)) {
      await this.ingestBody(req, res, ctx);
      await this.manager.postAdminTicket(res, ctx);
    }
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetMeta(req, res, ctx) {
    const _scope = _fileScope('handlerGetMeta');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    this.setResponseType(responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.manager.getMeta(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetAuthorization(req, res, ctx) {
    const _scope = _fileScope('handlerGetAuthorization');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx, this.loginPath)) {
      await this.manager.getAuthorization(res, ctx);
    }
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostAuthorization(req, res, ctx) {
    const _scope = _fileScope('handlerPostAuthorization');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    this.setResponseType(responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postAuthorization(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostConsent(req, res, ctx) {
    const _scope = _fileScope('handlerPostConsent');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    // This isn't specified as required as any valid payload carries intrinsic auth data.
    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postConsent(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostTicket(req, res, ctx) {
    const _scope = _fileScope('handlerPostTicket');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    this.setResponseType(responseTypes, req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postTicket(req, res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostToken(req, res, ctx) {
    const _scope = _fileScope('handlerPostToken');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    this.setResponseType(responseTypes, req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postToken(req, res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostRevocation(req, res, ctx) {
    const _scope = _fileScope('handlerPostRevocation');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    this.setResponseType(responseTypes, req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postRevocation(req, res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostIntrospection(req, res, ctx) {
    const _scope = _fileScope('handlerPostIntrospection');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    await this.resourceAuthenticator.required(req, res, ctx);

    this.setResponseType(responseTypes, req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postIntrospection(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostUserInfo(req, res, ctx) {
    const _scope = _fileScope('handlerPostUserInfo');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    this.setResponseType(responseTypes, req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postUserInfo(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetRoot(req, res, ctx) {
    const _scope = _fileScope('handlerGetRoot');
    const responseTypes = [
      Enum.ContentType.TextHTML,
    ];
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.manager.getRoot(res, ctx);
  }


  /**
   * Temporary to see what an unsolicited payload contains.
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerWhaGwan(req, res, ctx) {
    this.setResponseType(this.responseTypes, req, res, ctx);
    await this.ingestBody(req, res, ctx);
    throw new ResponseError(Enum.ErrorResponse.MethodNotAllowed);
  }

  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetHealthcheck(req, res, ctx) {
    const _scope = _fileScope('handlerGetHealthcheck');
    this.logger.debug(_scope, 'called', { req, ctx });
  
    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.manager.getHealthcheck(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetAdminMaintenance(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminMaintenance');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx, this.loginPath)) {
      await this.manager.getAdminMaintenance(res, ctx);
    }
  }


  /**
   * FIXME: This doesn't seem to be working as envisioned. Maybe override render error method instead???
   * Intercept this and redirect if we have enough information, otherwise default to framework.
   * Fixing this will likely have to wait until an e2e test framework is in place.
   * The redirect attempt should probably be contained in a Manager method, but here it is for now.
   * @param {http.IncomingMessage} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerInternalServerError(req, res, ctx) {
    const _scope = _fileScope('handlerInternalServerError');
    this.logger.debug(_scope, 'called', { req, ctx });

    if (ctx?.session?.redirectUri && ctx?.session?.clientIdentifier) {
      Object.entries({
        ...(ctx.session.state && { 'state': ctx.session.state }),
        'error': 'server_error',
        'error_description': 'An internal server error occurred',
      }).forEach(([name, value]) => ctx.session.redirectUri.searchParams.set(name, value));
      res.statusCode = 302; // Found
      res.setHeader(Enum.Header.Location, ctx.session.redirectUri.href);
      res.end();
      return;
    }

    await super.handlerInternalServerError(req, res, ctx);
  }


}

module.exports = Service;

