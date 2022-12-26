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
   * Query the current schema version.
   * This is a standalone query function, as it is called before statements are loaded.
   * @returns {Object} version
   * @returns {Number} version.major
   * @returns {Number} version.minor
   * @returns {Number} version.patch
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
   * @param {*} dbCtx
   * @param {Function} fn fn(txCtx)
   */
  async transaction(dbCtx, fn) {
    this._notImplemented('transaction', arguments);
  }


  /**
   * @param {*} x
   * @returns {Boolean}
   */
  static _isUUID(x) {
    try {
      uuid.parse(x);
      return true;
    } catch (e) {
      return false;
    }
  }


  /**
   * @param {*} x
   * @returns {Boolean}
   */
  static _isInfinites(x) {
    return typeof(x) === 'number'
      && Math.abs(x) === Infinity;
  }

  /**
   * Basic type checking of object properties.
   * @param {Object} object
   * @param {String[]} properties
   * @param {String[]} types
   */
  _ensureTypes(object, properties, types) {
    const _scope = _fileScope('_ensureTypes');

    if (!(object && properties && types)) {
      this.logger.error(_scope, 'undefined argument', { object, properties, types });
      throw new DatabaseErrors.DataValidation();
    }
    properties.forEach((p) => {
      // eslint-disable-next-line security/detect-object-injection
      const pObj = object[p];
      const pType = typeof pObj;
      if (!types.includes(pType)
      &&  !(types.includes('array') && Array.isArray(pObj))
      &&  !(types.includes('buffer') && pObj instanceof Buffer)
      &&  !(types.includes('date') && pObj instanceof Date)
      &&  !(types.includes('infinites'))
      &&  !(types.includes('null') && pObj === null)
      &&  !(types.includes('number') && pType === 'bigint')
      &&  !(types.includes('uuid') && Database._isUUID(pObj))) {
        const reason = `'${p}' is '${pType}', but must be ${types.length > 1 ? 'one of ' : ''}'${types}'`;
        this.logger.error(_scope, reason, {});
        throw new DatabaseErrors.DataValidation(reason);
      }
    });
  }


  /**
   * @typedef {Object} Authentication
   * @property {String} identifier
   * @property {String=} credential
   * @property {Date} created
   * @property {Date=} lastAuthenticated
   */
  /**
   * @param {Authentication} authentication 
   */
  _validateAuthentication(authentication) {
    [
      [['identifier'], ['string']],
      [['credential'], ['string', 'null']],
      [['created'], ['date']],
      [['lastAuthenticated'], ['date', 'infinites']],
    ].forEach(([properties, types]) => this._ensureTypes(authentication, properties, types));
  }


  /**
   * @typedef {Object} Resource
   * @property {String} resourceId - uuid
   * @property {String} secret
   * @property {String} description
   * @property {Date} created
   */
  /**
   * @param {Resource} resource
   */
  _validateResource(resource) {
    [
      [['resourceId', 'secret', 'description'], ['string']],
      [['resourceId'], ['uuid']],
      [['created'], ['date']],
    ].forEach(([properties, types]) => this._ensureTypes(resource, properties, types));
  }


  /**
   * @typedef {Object} Token
   * @property {String} codeId - uuid
   * @property {String} profile
   * @property {Date} created
   * @property {Date=} expires
   * @property {Date=} refreshExpires
   * @property {Date=} refreshed
   * @property {*=} duration
   * @property {*=} refreshDuration
   * @property {Number|BigInt=} refresh_count
   * @property {Boolean} is_revoked
   * @property {Boolean} is_token
   * @property {String} client_id
   * @property {String[]} scopes
   * @property {Object=} profileData
   */
  /**
   * @param {Token} token
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
   * @param {String} method
   * @param {arguments} args
   */
  _notImplemented(method, args) {
    this.logger.error(_fileScope(method), 'abstract method called', Array.from(args));
    throw new DatabaseErrors.NotImplemented(method);
  }


  /**
   * Get all the almanac entries.
   * @param {*} dbCtx
   */
  async almanacGetAll(dbCtx) {
    this._notImplemented('almanacGetAll', arguments);
  }


  /**
   * Fetch the authentication record for an identifier.
   * @param {*} dbCtx
   * @param {String} identifier
   * @returns {Promise<Authentication>}
   */
  async authenticationGet(dbCtx, identifier) {
    this._notImplemented('authenticationGet', arguments);
  }


  /**
   * Update the authentication record for the identifier that
   * correct credentials have been supplied.
   * @param {*} dbCtx
   * @param {String} identifier
   * @returns {Promise<void>}
   */
  async authenticationSuccess(dbCtx, identifier) {
    this._notImplemented('authenticationSuccess', arguments);
  }


  /**
   * Insert or update the credential for an identifier.
   * @param {*} dbCtx
   * @param {String} identifier
   * @param {String} credential
   * @returns {Promise<void>}
   */
  async authenticationUpsert(dbCtx, identifier, credential) {
    this._notImplemented('authenticationUpsert', arguments);
  }


  /**
   * Determine if profile url is known to this service.
   * @param {*} dbCtx
   * @param {String} profile
   * @returns {Promise<Boolean>}
   */
  async profileIsValid(dbCtx, profile) {
    this._notImplemented('profileGet', arguments);
  }


  /**
   * Insert a new relationship between a profile endpoint and
   * an authenticated identifier.
   * @param {*} dbCtx
   * @param {String} profile
   * @param {String} identifier
   * @returns {Promise<void>}
   */
  async profileIdentifierInsert(dbCtx, profile, identifier) {
    this._notImplemented('profileIdentifierInsert', arguments);
  }


  /**
   * Adds a scope to be available for a profile to include on any authorization request.
   * @param {*} dbCtx
   * @param {String} profile
   * @param {String} scope
   * @returns {Promise<void>}
   */
  async profileScopeInsert(dbCtx, profile, scope) {
    this._notImplemented('profileScopeInsert', arguments);
  }


  /**
   * @typedef {Object} ScopeDetails
   * @property {String} description
   * @property {String[]=} profiles
   */
  /**
   * @typedef {Object.<String, Object>} ProfileScopes
   * @property {Object.<String, Object>} profile
   * @property {Object.<String, ScopeDetails>} profile.scope
   */
  /**
   * @typedef {Object.<String, Object>} ScopeIndex
   * @property {ScopeDetails} scope
   */
  /**
   * @typedef {Object} ProfilesScopesReturn
   * @property {ProfileScopes} profileScopes
   * @property {ScopeIndex} scopeIndex
   * @property {String[]} profiles
   */
  /**
   * Returns an object containing:
   * - an object with profiles as keys to objects with scopes as keys to scope objects,
   *   which each contain a description of the scope and a list of profiles offering it
   * - an object with scopes as keys to the same scope objects
   * - a list of profiles
   * @param {*} dbCtx
   * @param {String} identifier
   * @returns {Promise<ProfileScopesReturn>}
   */
  async profilesScopesByIdentifier(dbCtx, identifier) {
    this._notImplemented('profilesScopesByIdentifier', arguments);
  }


  /**
   * @typedef ProfileScopesRow
   * @property profile
   * @property scope
   * @property description
   * @property application
   * @property isPermanent
   * @property isManuallyAdded
   */
  /**
   * Convert db row data into associative structures.
   * Same behavior is shared by multiple engines.
   * @param {ProfileScopesRow[]} profileScopesRows
   * @returns {ProfileScopesReturn}
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
   * @param {*} dbCtx
   * @param {String} profile
   * @param {String[]} scopes
   * @returns {Promise<void>}
   */
  async profileScopesSetAll(dbCtx, profile, scopes) {
    this._notImplemented('profileScopesSetAll', arguments);
  }


  /**
   * Create (or revoke a duplicate) code as a token entry.
   * @param {*} dbCtx
   * @param {Object} data
   * @param {String} data.codeId
   * @param {Date} data.created
   * @param {Boolean} data.isToken
   * @param {String} data.clientId
   * @param {String} data.profile - profile uri
   * @param {String} data.identifier
   * @param {String[]} data.scopes
   * @param {Number|Null} data.lifespanSeconds - null sets expiration to Infinity
   * @param {Number|Null} data.refreshLifespanSeconds - null sets refresh to none
   * @param {String|Null} data.resource
   * @param {Object|Null} data.profileData - profile data from profile uri
   * @returns {Promise<Boolean>} whether redemption was successful
   */
  async redeemCode(dbCtx, { codeId, created, isToken, clientId, profile, identifier, scopes, lifespanSeconds, refreshLifespanSeconds, profileData } = {}) {
    this._notImplemented('redeemCode', arguments);
  }


  /**
   * @typedef {Object} RefreshedToken
   * @property {Date} expires
   * @property {Date} refreshExpires
   * @property {String[]=} scopes if scopes were reduced
   */
  /**
   * Redeem a refresh token to renew token codeId.
   * @param {*} dbCtx
   * @param {String} codeId
   * @param {Date} refreshed
   * @param {String[]} removeScopes
   * @returns {Promise<RefreshedToken>}
   */
  async refreshCode(dbCtx, codeId, refreshed, removeScopes) {
    this._notImplemented('refreshCode', arguments);
  }


  /**
   * Fetch a resource server record.
   * @param {*} dbCtx
   * @param {String} identifier uuid
   * @returns {Promise<Resource>}
   */
  async resourceGet(dbCtx, resourceId) {
    this._notImplemented('resourceGet', arguments);
  }


  /**
   * Create, or update description of, a resourceId.
   * @param {*} dbCtx
   * @param {String=} resourceId uuid
   * @param {String=} secret
   * @param {String=} description
   * @returns {Promise<void>}
   */
  async resourceUpsert(dbCtx, resourceId, secret, description) {
    this._notImplemented('resourceUpsert', arguments);
  }


  /**
   * Register a scope and its description.
   * @param {*} dbCtx
   * @param {String} scope
   * @param {String} application
   * @param {String} description
   * @returns {Promise<void>}
   */
  async scopeUpsert(dbCtx, scope, application, description, manuallyAdded = false) {
    this._notImplemented('scopeUpsert', arguments);
  }


  /**
   * Remove a non-permanent scope if it is not currently in use.
   * @param {*} dbCtx
   * @param {String} scope
   * @returns {Promise<Boolean>}
   */
  async scopeDelete(dbCtx, scope) {
    this._notImplemented('scopeDelete', arguments);
  }


  /**
   * @typedef {Number|BigInt} CleanupResult
   */
  /**
   * @typedef {Object} CleanupResult
   */
  /**
   * Remove any non-permanent and non-manually-created scopes not currently in use.
   * @param {*} dbCtx
   * @param {Number} atLeastMsSinceLast skip cleanup if already executed this recently
   * @returns {Promise<CleanupResult>}
   */
  async scopeCleanup(dbCtx, atLeastMsSinceLast) {
    this._notImplemented('scopeClean', arguments);
  }


  /**
   * Forget tokens after they have expired, and redeemed codes after they have expired.
   * @param {*} dbCtx
   * @param {Number} codeLifespanSeconds
   * @param {Number} atLeastMsSinceLast skip cleanup if already executed this recently
   * @returns {Promise<CleanupResult>}
   */
  async tokenCleanup(dbCtx, codeLifespanSeconds, atLeastMsSinceLast) {
    this._notImplemented('tokenCleanup', arguments);
  }


  /**
   * Look up a redeemed token by code_id.
   * @param {*} dbCtx
   * @param {String} codeId
   * @returns {Promise<Token>}
   */
  async tokenGetByCodeId(dbCtx, codeId) {
    this._notImplemented('tokenGetByCodeId', arguments);
  }


  /**
   * Sets a redeemed token as revoked.
   * @param {*} dbCtx
   * @param {String} codeId - uuid
   * @returns {Promise<void>}
   */
  async tokenRevokeByCodeId(dbCtx, codeId) {
    this._notImplemented('tokenRevokeByCodeId', arguments);
  }


  /**
   * Revoke the refreshability of a codeId.
   * @param {*} dbCtx
   * @param {String} codeId - uuid
   * @returns {Promise<void>}
   */
  async tokenRefreshRevokeByCodeId(dbCtx, codeId) {
    this._notImplemented('tokenRefreshRevokeByCodeId', arguments);
  }


  /**
   * Get all tokens assigned to identifier.
   * @param {*} dbCtx
   * @param {String} identifier
   * @returns {Promise<Tokens[]>}
   */
  async tokensGetByIdentifier(dbCtx, identifier) {
    this._notImplemented('tokensGetByIdentifier', arguments);
  }

}

module.exports = Database;