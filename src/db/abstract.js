/* eslint-disable no-unused-vars */
'use strict';

const common = require('../common');
const DatabaseErrors = require('./errors');
const svh = require('./schema-version-helper');
const uuid = require('uuid');

const _fileScope = common.fileScope(__filename);

class Database {
  constructor(logger, options) {
    this.logger = logger;
    this.options = options;
  }


  /**
   * Perform tasks needed to prepare database for use.  Ensure this is called
   * after construction, and before any other database activity.
   * At the minimum, this will validate a compatible schema is present and usable.
   * Some engines will also perform other initializations or async actions which
   * are easier handled outside the constructor.
   */
  async initialize() {
    const _scope = _fileScope('initialize');

    const currentSchema = await this._currentSchema();
    const current = svh.schemaVersionObjectToNumber(currentSchema);
    const min = svh.schemaVersionObjectToNumber(this.schemaVersionsSupported.min);
    const max = svh.schemaVersionObjectToNumber(this.schemaVersionsSupported.max);
    if (current >= min && current <= max) {
      this.logger.debug(_scope, 'schema supported', { currentSchema, schemaVersionsSupported: this.schemaVersionsSupported });
    } else {
      this.logger.error(_scope, 'schema not supported', { currentSchema, schemaVersionsSupported: this.schemaVersionsSupported });
      throw new DatabaseErrors.MigrationNeeded();
    }
  }


  /**
   * @typedef {object} SchemaVersionObject
   * @property {number} major major
   * @property {number} minor minor
   * @property {number} patch patch
   */
  /**
   * Query the current schema version.
   * This is a standalone query function, as it is called before statements are loaded.
   * @returns {Promise<SchemaVersionObject>} schema version
   */
  async _currentSchema() {
    this._notImplemented('_currentSchema', arguments);
  }


  /**
   * Perform db connection health-check, if applicable.
   * Throw something if a database situation should pull us out of a load-balancer.
   */
  async healthCheck() {
    this._notImplemented('healthCheck', arguments);
  }


  /**
   * Wrap a function call in a database context.
   * @param {Function} fn fn(ctx)
   */
  async context(fn) {
    this._notImplemented('context', arguments);
  }

  /**
   * Wrap a function call in a transaction context.
   * @param {*} dbCtx db context
   * @param {Function} fn fn(txCtx)
   */
  async transaction(dbCtx, fn) {
    this._notImplemented('transaction', arguments);
  }


  /**
   * Basic type checking of object properties.
   *
   * Types may be any of the built-in types:
   * - boolean
   * - bigint (also allowed with 'number')
   * - function
   * - number (this will also allow 'bigint')
   * - object
   * - string
   * - symbol
   * - undefined
   *
   * Types may also be any of the following:
   * - array
   * - buffer
   * - date
   * - infinites
   * - null
   * - uuid
   * @param {object} object object
   * @param {string[]} properties properties
   * @param {string[]} types types
   */
  _ensureTypes(object, properties, types) {
    const _scope = _fileScope('_ensureTypes');

    if (!(object && properties && types)) {
      this.logger.error(_scope, 'undefined argument', { object, properties, types });
      throw new DatabaseErrors.DataValidation();
    }

    const supportedTypes = [
      'array',
      'bigint',
      'boolean',
      'buffer',
      'date',
      'function',
      'infinites',
      'null',
      'number',
      'object',
      'string',
      'symbol',
      'undefined',
      'uuid',
    ];
    types.forEach((t) => {
      if (!supportedTypes.includes(t)) {
        this.logger.error(_scope, 'unsupported type', { object, properties, types, unsupportedType: t });
        throw new DatabaseErrors.DataValidation();
      }
    });

    properties.forEach((p) => {
      // eslint-disable-next-line security/detect-object-injection
      const pObj = object[p];
      const pType = typeof pObj;
      if (!types.includes(pType)
      &&  !(types.includes('array') && Array.isArray(pObj))
      &&  !(types.includes('buffer') && pObj instanceof Buffer)
      &&  !(types.includes('date') && pObj instanceof Date)
      &&  !(types.includes('infinites') && Math.abs(pObj) === Infinity)
      &&  !(types.includes('null') && pObj === null)
      &&  !(types.includes('number') && pType === 'bigint')
      &&  !(types.includes('uuid') && uuid.validate(pObj))) {
        const reason = `'${p}' is '${pType}', but must be ${types.length > 1 ? 'one of ' : ''}'${types}'`;
        this.logger.error(_scope, reason, {});
        throw new DatabaseErrors.DataValidation(reason);
      }
    });
  }


  /**
   * @typedef {object} Authentication
   * @property {string} identifier identifier
   * @property {string=} credential credential
   * @property {Date} created created
   * @property {Date=} lastAuthentication last authentication
   */
  /**
   * @param {Authentication} authentication authentication
   */
  _validateAuthentication(authentication) {
    [
      [['identifier'], ['string']],
      [['credential'], ['string', 'null']],
      [['created'], ['date']],
      [['lastAuthentication'], ['date', 'infinites']],
    ].forEach(([properties, types]) => this._ensureTypes(authentication, properties, types));
  }


  /**
   * @typedef {object} Resource
   * @property {string} resourceId uuid
   * @property {string} secret secret
   * @property {string} description description
   * @property {Date} created created at
   */
  /**
   * @param {Resource} resource resource
   */
  _validateResource(resource) {
    [
      [['resourceId', 'secret', 'description'], ['string']],
      [['resourceId'], ['uuid']],
      [['created'], ['date']],
    ].forEach(([properties, types]) => this._ensureTypes(resource, properties, types));
  }


  /**
   * @typedef {object} Token
   * @property {string} codeId uuid
   * @property {string} profile profile
   * @property {Date} created created at
   * @property {Date=} expires expires at
   * @property {Date=} refreshExpires refresh expires at
   * @property {Date=} refreshed refreshed at
   * @property {*=} duration duration
   * @property {*=} refreshDuration refresh duration
   * @property {number | bigint=} refresh_count refresh count
   * @property {boolean} is_revoked is revoked
   * @property {boolean} is_token is token
   * @property {string} client_id client id
   * @property {string[]} scopes scopes
   * @property {object=} profileData profile data
   */
  /**
   * @param {Token} token token
   */
  _validateToken(token) {
    [
      [['codeId', 'profile', 'clientId'], ['string']],
      [['codeId'], ['uuid']],
      [['created'], ['date']],
      [['expires', 'refreshExpires', 'refreshed'], ['date', 'null']],
      [['isToken', 'isRevoked'], ['boolean']],
      [['scopes'], ['array']],
      [['profileData'], ['object', 'null']],
    ].forEach(([properties, types]) => this._ensureTypes(token, properties, types));
    this._ensureTypes(token.scopes, Object.keys(token.scopes), ['string']);
  }


  /**
   * Interface methods need implementations.  Ensure the db-interaction
   * methods on the base class call this, so they may be overridden by
   * implementation classes.
   * @param {string} method method
   * @param {arguments} args args
   */
  _notImplemented(method, args) {
    this.logger.error(_fileScope(method), 'abstract method called', Array.from(args));
    throw new DatabaseErrors.NotImplemented(method);
  }


  /**
   * Get all the almanac entries.
   * @param {*} dbCtx db context
   */
  async almanacGetAll(dbCtx) {
    this._notImplemented('almanacGetAll', arguments);
  }


  /**
   * Insert or update an almanac entry.
   * @param {*} dbCtx db context
   * @param {string} event event
   * @param {Date=} date date
   */
  async almanacUpsert(dbCtx, event, date) {
    this._notImplemented('almanacUpsert', arguments);
  }


  /**
   * Fetch the authentication record for an identifier.
   * @param {*} dbCtx db context
   * @param {string} identifier identifier
   * @returns {Promise<Authentication>} authentication
   */
  async authenticationGet(dbCtx, identifier) {
    this._notImplemented('authenticationGet', arguments);
  }


  /**
   * Update the authentication record for the identifier that
   * correct credentials have been supplied.
   * @param {*} dbCtx db context
   * @param {string} identifier identifier
   * @returns {Promise<void>}
   */
  async authenticationSuccess(dbCtx, identifier) {
    this._notImplemented('authenticationSuccess', arguments);
  }


  /**
   * Insert or update the credential for an identifier.
   * @param {*} dbCtx db context
   * @param {string} identifier identifier
   * @param {string} credential credential
   * @param {string=} otpKey otp key
   * @returns {Promise<void>}
   */
  async authenticationUpsert(dbCtx, identifier, credential, otpKey) {
    this._notImplemented('authenticationUpsert', arguments);
  }


  /**
   * Update the otpKey for an identifier.
   * @param {*} dbCtx db context
   * @param {string} identifier identifier
   * @param {string=} otpKey otp key
   * @returns {Promise<void>}
   */
  async authenticationUpdateOTPKey(dbCtx, identifier, otpKey) {
    this._notImplemented('authenticationUpdateOTPKey', arguments);
  }


  /**
   * Update the credential for an identifier.
   * @param {*} dbCtx db context
   * @param {string} identifier identifier
   * @param {string} credential credential
   * @returns {Promise<void>}
   */
  async authenticationUpdateCredential(dbCtx, identifier, credential) {
    this._notImplemented('authenticationUpdateCredentials', arguments);
  }


  /**
   * Determine if profile url is known to this service.
   * @param {*} dbCtx db context
   * @param {string} profile profile
   * @returns {Promise<boolean>} is valid
   */
  async profileIsValid(dbCtx, profile) {
    this._notImplemented('profileGet', arguments);
  }


  /**
   * Insert a new relationship between a profile endpoint and
   * an authenticated identifier.
   * @param {*} dbCtx db context
   * @param {string} profile profile
   * @param {string} identifier identifier
   * @returns {Promise<void>}
   */
  async profileIdentifierInsert(dbCtx, profile, identifier) {
    this._notImplemented('profileIdentifierInsert', arguments);
  }


  /**
   * Adds a scope to be available for a profile to include on any authorization request.
   * @param {*} dbCtx db context
   * @param {string} profile profile
   * @param {string} scope scope
   * @returns {Promise<void>}
   */
  async profileScopeInsert(dbCtx, profile, scope) {
    this._notImplemented('profileScopeInsert', arguments);
  }


  /**
   * @typedef {object} ScopeDetails
   * @property {string} description description
   * @property {string[]=} profiles profiles
   */
  /**
   * @typedef {object} Profile
   * @property {ScopeDetails} scope scope
   */
  /**
   * @typedef {{[profile: string]: Profile}} ProfileScopes
   */
  /**
   * @typedef {{[scope: string]: ScopeDetails}} ScopeIndex
   * @property {ScopeDetails} scope scope details
   */
  /**
   * @typedef {object} ProfilesScopesReturn
   * @property {ProfileScopes} profileScopes profile scopes
   * @property {ScopeIndex} scopeIndex scope index
   * @property {string[]} profiles profiles
   */
  /**
   * Returns an object containing:
   * - an object with profiles as keys to objects with scopes as keys to scope objects,
   *   which each contain a description of the scope and a list of profiles offering it
   * - an object with scopes as keys to the same scope objects
   * - a list of profiles
   * @param {*} dbCtx db context
   * @param {string} identifier identifier
   * @returns {Promise<ProfilesScopesReturn>} profiles scopes
   */
  async profilesScopesByIdentifier(dbCtx, identifier) {
    this._notImplemented('profilesScopesByIdentifier', arguments);
  }


  /**
   * @typedef ProfileScopesRow
   * @property {string} profile profile
   * @property {string} scope scope
   * @property {string} description description
   * @property {string} application application
   * @property {boolean} isPermanent avoid cleanup
   * @property {boolean} isManuallyAdded avoid cleanup
   */
  /**
   * Convert db row data into associative structures.
   * Same behavior is shared by multiple engines.
   * @param {ProfileScopesRow[]} profileScopesRows profile scopes row
   * @returns {ProfilesScopesReturn} profiles scopes
   */
  static _profilesScopesBuilder(profileScopesRows) {
    const scopeIndex = {};
    const profileScopes = {};
    const profileSet = new Set();

    (profileScopesRows || []).forEach(({ profile, scope, description, application, isPermanent, isManuallyAdded }) => {
      if (scope && !(scope in scopeIndex)) {
        scopeIndex[scope] = { // eslint-disable-line security/detect-object-injection
          description,
          application,
          isPermanent,
          isManuallyAdded,
          profiles: [],
        };
      }
      if (profile) {
        profileSet.add(profile);
        if (!(profile in profileScopes)) {
          profileScopes[profile] = {}; // eslint-disable-line security/detect-object-injection
        }
      }
      if (profile && scope) {
        scopeIndex[scope].profiles.push(profile); // eslint-disable-line security/detect-object-injection
        profileScopes[profile][scope] = scopeIndex[scope]; // eslint-disable-line security/detect-object-injection
      }
    });

    return {
      profiles: [...profileSet],
      profileScopes,
      scopeIndex,
    };
  }


  /**
   * Sets list of additional scopes available to profile.
   * @param {*} dbCtx db context
   * @param {string} profile profile
   * @param {string[]} scopes scopes
   * @returns {Promise<void>}
   */
  async profileScopesSetAll(dbCtx, profile, scopes) {
    this._notImplemented('profileScopesSetAll', arguments);
  }


  /**
   * Create (or revoke a duplicate) code as a token entry.
   * @param {*} dbCtx db context
   * @param {object} data data
   * @param {string} data.codeId code id
   * @param {Date} data.created created at
   * @param {boolean} data.isToken is token
   * @param {string} data.clientId client id
   * @param {string} data.profile profile uri
   * @param {string} data.identifier identifier
   * @param {string[]} data.scopes scopesx
   * @param {number | null} data.lifespanSeconds null sets expiration to Infinity
   * @param {number | null} data.refreshLifespanSeconds null sets refresh to none
   * @param {object | null} data.profileData profile data from profile uri
   * @returns {Promise<boolean>} whether redemption was successful
   */
  async redeemCode(dbCtx, { codeId, created, isToken, clientId, profile, identifier, scopes, lifespanSeconds, refreshLifespanSeconds, profileData } = {}) {
    this._notImplemented('redeemCode', arguments);
  }


  /**
   * @typedef {object} RefreshedToken
   * @property {Date} expires expires at
   * @property {Date} refreshExpires refresh expires at
   * @property {string[]=} scopes if scopes were reduced
   */
  /**
   * Redeem a refresh token to renew token codeId.
   * @param {*} dbCtx db context
   * @param {string} codeId code id
   * @param {Date} refreshed refreshed at
   * @param {string[]} removeScopes remove scopes
   * @returns {Promise<RefreshedToken>} refreshed token
   */
  async refreshCode(dbCtx, codeId, refreshed, removeScopes) {
    this._notImplemented('refreshCode', arguments);
  }


  /**
   * Fetch a resource server record.
   * @param {*} dbCtx db context
   * @param {string} resourceId uuid
   * @returns {Promise<Resource>} resource
   */
  async resourceGet(dbCtx, resourceId) {
    this._notImplemented('resourceGet', arguments);
  }


  /**
   * Create, or update description of, a resourceId.
   * @param {*} dbCtx db context
   * @param {string=} resourceId uuid
   * @param {string=} secret secret
   * @param {string=} description description
   * @returns {Promise<void>}
   */
  async resourceUpsert(dbCtx, resourceId, secret, description) {
    this._notImplemented('resourceUpsert', arguments);
  }


  /**
   * Register a scope and its description.
   * @param {*} dbCtx db context
   * @param {string} scope scope
   * @param {string} application application
   * @param {string} description description
   * @param {boolean} manuallyAdded is manually added
   * @returns {Promise<void>}
   */
  async scopeUpsert(dbCtx, scope, application, description, manuallyAdded = false) {
    this._notImplemented('scopeUpsert', arguments);
  }


  /**
   * Remove a non-permanent scope if it is not currently in use.
   * @param {*} dbCtx db context
   * @param {string} scope scope
   * @returns {Promise<boolean>} deleted
   */
  async scopeDelete(dbCtx, scope) {
    this._notImplemented('scopeDelete', arguments);
  }


  /**
   * @typedef {number | bigint} CleanupResult
   */
  /**
   * @alias {object} CleanupResult
   */
  /**
   * Remove any non-permanent and non-manually-created scopes not currently in use.
   * @param {*} dbCtx db context
   * @param {number} atLeastMsSinceLast skip cleanup if already executed this recently
   * @returns {Promise<CleanupResult>} cleanup result
   */
  async scopeCleanup(dbCtx, atLeastMsSinceLast) {
    this._notImplemented('scopeClean', arguments);
  }


  /**
   * Forget tokens after they have expired, and redeemed codes after they have expired.
   * @param {*} dbCtx db context
   * @param {number} codeLifespanSeconds code lifespan seconds
   * @param {number} atLeastMsSinceLast skip cleanup if already executed this recently
   * @returns {Promise<CleanupResult>} cleanup result
   */
  async tokenCleanup(dbCtx, codeLifespanSeconds, atLeastMsSinceLast) {
    this._notImplemented('tokenCleanup', arguments);
  }


  /**
   * Look up a redeemed token by code_id.
   * @param {*} dbCtx db context
   * @param {string} codeId code id
   * @returns {Promise<Token>} token
   */
  async tokenGetByCodeId(dbCtx, codeId) {
    this._notImplemented('tokenGetByCodeId', arguments);
  }


  /**
   * Sets a redeemed token as revoked.
   * @param {*} dbCtx db context
   * @param {string} codeId - uuid
   * @returns {Promise<void>}
   */
  async tokenRevokeByCodeId(dbCtx, codeId) {
    this._notImplemented('tokenRevokeByCodeId', arguments);
  }


  /**
   * Revoke the refreshability of a codeId.
   * @param {*} dbCtx db context
   * @param {string} codeId - uuid
   * @returns {Promise<void>}
   */
  async tokenRefreshRevokeByCodeId(dbCtx, codeId) {
    this._notImplemented('tokenRefreshRevokeByCodeId', arguments);
  }


  /**
   * Get all tokens assigned to identifier.
   * @param {*} dbCtx db context
   * @param {string} identifier identifier
   * @returns {Promise<Token[]>} token
   */
  async tokensGetByIdentifier(dbCtx, identifier) {
    this._notImplemented('tokensGetByIdentifier', arguments);
  }


  /**
   * @typedef {object} RedeemedTicketData
   * @property {string} subject subject
   * @property {string} resource resource
   * @property {string=} iss issuer
   * @property {string} ticket ticket
   * @property {string} token token
   */
  /**
   * Persist details of a redeemed ticket.
   * @param {*} dbCtx db context
   * @param {RedeemedTicketData} redeemedData redeemed data
   * @returns {Promise<void>}
   */
  async ticketRedeemed(dbCtx, redeemedData) {
    this._notImplemented('ticketRedeemed', arguments);
  }


  /**
   * Update details of a redeemed ticket that it has been published.
   * @param {*} dbCtx db context
   * @param {RedeemedTicketData} redeemedData redeemed data
   * @returns {Promise<void>}
   */
  async ticketTokenPublished(dbCtx, redeemedData) {
    this._notImplemented('ticketTokenPublished', arguments);
  }


  /**
   * Retrieve redeemed tokens which have not yet been published to queue.
   * @param {*} dbCtx db context
   * @param {number} limit limit
   * @returns {Promise<RedeemedTicketData[]>} redeemed but not published
   */
  async ticketTokenGetUnpublished(dbCtx, limit) {
    this._notImplemented('ticketTokenGetUnpublished', arguments);
  }

}

module.exports = Database;
