'use strict';

const common = require('../../common');
const Enum = require('../../enum');
const Database = require('../abstract');
const DBErrors = require('../errors');
const { unappliedSchemaVersions } = require('../schema-version-helper');
const SQLite = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid');
const { performance } = require('perf_hooks');

const _fileScope = common.fileScope(__filename);

const schemaVersionsSupported = {
  min: {
    major: 1,
    minor: 0,
    patch: 0,
  },
  max: {
    major: 1,
    minor: 2,
    patch: 0,
  },
};

// max of signed int64 (2^63 - 1), should be enough
// const EPOCH_FOREVER = BigInt('9223372036854775807');

class DatabaseSQLite extends Database {
  constructor(logger, options) {
    super(logger, options);

    const connectionString = options.db.connectionString || 'sqlite://:memory:';
    const csDelim = '://';
    const dbFilename = connectionString.slice(connectionString.indexOf(csDelim) + csDelim.length);

    const queryLogLevel = options.db.queryLogLevel;

    const sqliteOptions = {
      ...(queryLogLevel && {
        // eslint-disable-next-line security/detect-object-injection
        verbose: (query) => this.logger[queryLogLevel](_fileScope('SQLite:verbose'), '', { query }),
      }),
    };
    this.db = new SQLite(dbFilename, sqliteOptions);
    this.schemaVersionsSupported = schemaVersionsSupported;
    this.changesSinceLastOptimize = BigInt(0);
    this.optimizeAfterChanges = options.db.sqliteOptimizeAfterChanges || 0; // Default to no periodic optimization.
    this.db.pragma('foreign_keys = on'); // Enforce consistency.
    this.db.pragma('journal_mode = WAL'); // Be faster, expect local filesystem.
    this.db.defaultSafeIntegers(true); // This probably isn't necessary, but by using these BigInts we keep weird floats out of the query logs.

    this._initTables();
    this._initStatements();
  }


  /**
   * Boolean to 0/1 representation for SQLite params.
   * @param {Boolean} bool
   * @returns {Number}
   */
  static _booleanToNumeric(bool) {
    // eslint-disable-next-line security/detect-object-injection
    return {
      true: 1,
      false: 0,
    }[bool];
  }


  /**
   * SQLite cannot prepare its statements without a schema, ensure such exists.
   */
  _initTables() {
    const _scope = _fileScope('_initTables');

    // Migrations rely upon this table, ensure it exists.
    const metaVersionTable = '_meta_schema_version';
    const tableExists = this.db.prepare('SELECT name FROM sqlite_master WHERE type=:type AND name=:name').pluck(true).bind({ type: 'table', name: metaVersionTable });
    let metaExists = tableExists.get();
    if (metaExists === undefined) {
      const fPath = path.join(__dirname, 'sql', 'schema', 'init.sql');
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const fSql = fs.readFileSync(fPath, { encoding: 'utf8' });
      this.db.exec(fSql);
      metaExists = tableExists.get();
      /* istanbul ignore if */
      if (metaExists === undefined) {
        throw new DBErrors.UnexpectedResult(`did not create ${metaVersionTable} table`);
      }
      this.logger.info(_scope, 'created schema version table', { metaVersionTable });
    }

    // Apply migrations
    const currentSchema = this._currentSchema();
    const migrationsWanted = unappliedSchemaVersions(__dirname, currentSchema, this.schemaVersionsSupported);
    this.logger.debug(_scope, 'schema migrations wanted', { migrationsWanted });
    migrationsWanted.forEach((v) => {
      const fPath = path.join(__dirname, 'sql', 'schema', v, 'apply.sql');
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const fSql = fs.readFileSync(fPath, { encoding: 'utf8' });
      this.logger.info(_scope, 'applying migration', { version: v });
      this.db.exec(fSql);
    });
  }


  _initStatements() {
    const _scope = _fileScope('_initStatements');
    const sqlDir = path.join(__dirname, 'sql');
    this.statement = {};

    // Decorate the statement calls we use with timing and logging.
    const wrapFetch = (logName, statementName, fn) => {
      const _wrapScope = _fileScope(logName);
      return (...args) => {
        const startTimestampMs = performance.now();
        const rows = fn(...args);
        DatabaseSQLite._deOphidiate(rows);
        const elapsedTimeMs = performance.now() - startTimestampMs;
        this.logger.debug(_wrapScope, 'complete', { statementName, elapsedTimeMs });
        return rows;
      };
    };
    const wrapRun = (logName, statementName, fn) => {
      const _wrapScope = _fileScope(logName);
      return (...args) => {
        const startTimestampMs = performance.now();
        const result = fn(...args);
        const elapsedTimeMs = performance.now() - startTimestampMs;
        this._updateChanges(result);
        this.logger.debug(_wrapScope, 'complete', { ...result, statementName, elapsedTimeMs });
        result.duration = elapsedTimeMs;
        return result;
      };
    };

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    for (const f of fs.readdirSync(sqlDir)) {
      const fPath = path.join(sqlDir, f);
      const { name: fName, ext: fExt } = path.parse(f);
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const stat = fs.statSync(fPath);
      if (!stat.isFile()
      ||  fExt.toLowerCase() !== '.sql') {
        continue;
      }
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const fSql = fs.readFileSync(fPath, { encoding: 'utf8' });
      const statementName = common.camelfy(fName.toLowerCase(), '-');
      let statement;
      try {
        statement = this.db.prepare(fSql);
      } catch (e) /* istanbul ignore next */ {
        this.logger.error(_scope, 'failed to prepare statement', { error: e, file: f });
        throw e;
      }
      // eslint-disable-next-line security/detect-object-injection
      this.statement[statementName] = statement;
      const { get: origGet, all: origAll, run: origRun } = statement;
      statement.get = wrapFetch('SQLite:get', statementName, origGet.bind(statement));
      statement.all = wrapFetch('SQLite:all', statementName, origAll.bind(statement));
      statement.run = wrapRun('SQLite:run', statementName, origRun.bind(statement));
    }
    this.statement._optimize = this.db.prepare('SELECT * FROM pragma_optimize(0xffff)');

    this.logger.debug(_scope, 'statements initialized', { statements: Object.keys(this.statement).length });
  }


  static _deOphidiate(rows) {
    const rowsIsArray = Array.isArray(rows);
    if (!rowsIsArray) {
      rows = [rows];
    }
    const exemplaryRow = rows[0];
    for (const prop in exemplaryRow) {
      const camel = common.camelfy(prop);
      if (!(camel in exemplaryRow)) {
        for (const d of rows) {
          d[camel] = d[prop]; // eslint-disable-line security/detect-object-injection
          delete d[prop]; // eslint-disable-line security/detect-object-injection
        }
      }
    }
    return rowsIsArray ? rows : rows[0];
  }


  _currentSchema() {
    return this.db.prepare('SELECT major, minor, patch FROM _meta_schema_version ORDER BY major DESC, minor DESC, patch DESC LIMIT 1').get();
  }


  healthCheck() {
    const _scope = _fileScope('healthCheck');
    this.logger.debug(_scope, 'called', {});
    if (!this.db.open) {
      throw new DBErrors.UnexpectedResult('database is not open');
    }
    return { open: this.db.open };
  }


  _closeConnection() {
    this.db.close();
  }


  _optimize() {
    const _scope = _fileScope('_optimize');

    const optimize = this.statement._optimize.all();
    this.logger.debug(_scope, 'optimize', { optimize, changes: this.changesSinceLastOptimize });
    this.db.pragma('optimize');
    this.changesSinceLastOptimize = BigInt(0);
  }


  _updateChanges(dbResult) {
    if (this.optimizeAfterChanges) {
      this.changesSinceLastOptimize += BigInt(dbResult.changes);
      if (this.changesSinceLastOptimize >= this.optimizeAfterChanges) {
        this._optimize();
      }
    }
  }


  _purgeTables(really) {
    if (really) {
      [
        'almanac',
        'authentication',
        'profile',
        'redeemed_ticket',
        'resource',
        'token',
      ].forEach((table) => {
        const result = this.db.prepare(`DELETE FROM ${table}`).run();
        this.logger.debug(_fileScope('_purgeTables'), 'success', { table, result });
      });
    }
  }


  context(fn) {
    return fn(this.db);
  }


  transaction(dbCtx, fn) {
    dbCtx = dbCtx || this.db;
    return dbCtx.transaction(fn)();
  }


  static _almanacToNative(entry) {
    return {
      event: entry.event,
      date: new Date(Number(entry.epoch) * 1000),
    };
  }


  static _almanacErrorThrow() {
    throw new DBErrors.UnexpectedResult('did not update almanac');
  }


  almanacGetAll(dbCtx) { // eslint-disable-line no-unused-vars
    const _scope = _fileScope('almanacGetAll');
    this.logger.debug(_scope, 'called');

    try {
      const entries = this.statement.almanacGetAll.all();
      return entries.map((entry) => DatabaseSQLite._almanacToNative(entry));
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      throw e;
    }
  }


  almanacUpsert(dbCtx, event, date) {
    const _scope = _fileScope('almanacUpsert');
    this.logger.debug(_scope, 'called', { event, date });

    try {
      const epoch = common.dateToEpoch(date);
      const result = this.statement.almanacUpsert.run({ event, epoch });
      if (result.changes != 1) {
        this.constructor._almanacErrorThrow();
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, event, date });
      throw e;
    }
  }


  static _authenticationToNative(authentication) {
    if (authentication) {
      authentication.created = new Date(Number(authentication.created) * 1000);
      authentication.lastAuthentication = new Date(Number(authentication.lastAuthentication) * 1000);
    }
    return authentication;
  }


  authenticationGet(dbCtx, identifier) {
    const _scope = _fileScope('authenticationGet');
    this.logger.debug(_scope, 'called', { identifier });

    try {
      const authentication = this.statement.authenticationGet.get({ identifier });
      return DatabaseSQLite._authenticationToNative(authentication);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier });
      throw e;
    }
  }


  authenticationSuccess(dbCtx, identifier) {
    const _scope = _fileScope('authenticationSuccess');
    this.logger.debug(_scope, 'called', { identifier });

    try {
      const result = this.statement.authenticationSuccess.run({ identifier });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not update authentication success');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier });
      throw e;
    }
  }


  authenticationUpsert(dbCtx, identifier, credential, otpKey) {
    const _scope = _fileScope('authenticationUpsert');
    const scrubbedCredential = '*'.repeat((credential || '').length);
    const scrubbedOTPKey = '*'.repeat((otpKey || '').length);
    this.logger.debug(_scope, 'called', { identifier, scrubbedCredential, scrubbedOTPKey });

    try {
      const result = this.statement.authenticationUpsert.run({ identifier, credential, otpKey });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not upsert authentication');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier, scrubbedCredential, scrubbedOTPKey });
      throw e;
    }
  }


  authenticationUpdateCredential(dbCtx, identifier, credential) {
    const _scope = _fileScope('authenticationUpdateCredential');
    const scrubbedCredential = '*'.repeat((credential || '').length);
    this.logger.debug(_scope, 'called', { identifier, scrubbedCredential });

    try {
      const result = this.statement.authenticationUpdateCredential.run({ identifier, credential });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not update credential');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier, scrubbedCredential });
      throw e;
    }
  }


  authenticationUpdateOTPKey(dbCtx, identifier, otpKey) {
    const _scope = _fileScope('authenticationUpdateOTPKey');
    const scrubbedOTPKey = '*'.repeat((otpKey || '').length);
    this.logger.debug(_scope, 'called', { identifier, scrubbedOTPKey });

    try {
      const result = this.statement.authenticationUpdateOtpKey.run({ identifier, otpKey });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not update otpKey');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier, scrubbedOTPKey });
      throw e;
    }
  }


  profileIdentifierInsert(dbCtx, profile, identifier) {
    const _scope = _fileScope('profileIdentifierInsert');
    this.logger.debug(_scope, 'called', { profile, identifier });

    try {
      const result = this.statement.profileIdentifierInsert.run({ profile, identifier });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not insert profile identifier relationship');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, profile, identifier });
      throw e;
    }
  }


  profileIsValid(dbCtx, profile) {
    const _scope = _fileScope('profileIsValid');
    this.logger.debug(_scope, 'called', { profile });

    try {
      const profileResponse = this.statement.profileGet.get({ profile });
      return !!profileResponse;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, profile });
      throw e;
    }
  }


  profileScopeInsert(dbCtx, profile, scope) {
    const _scope = _fileScope('profileScopeInsert');
    this.logger.debug(_scope, 'called', { profile, scope });

    try {
      const result = this.statement.profileScopeInsert.run({ profile, scope });
      // Duplicate inserts get ignored
      if (result.changes != 1 && result.changes != 0) {
        throw new DBErrors.UnexpectedResult('did not insert profile scope');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, profile, scope });
      throw e;
    }
  }


  profileScopesSetAll(dbCtx, profile, scopes) {
    const _scope = _fileScope('profileScopesSetAll');
    this.logger.debug(_scope, 'called', { profile, scopes });

    try {
      this.transaction(dbCtx, () => {
        this.statement.profileScopesClear.run({ profile });
        if (scopes.length) {
          scopes.forEach((scope) => {
            this.statement.profileScopeInsert.run({ profile, scope });
          });
        }
      }); // transaction
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, profile, scopes });
      throw e;
    }
  }


  profilesScopesByIdentifier(dbCtx, identifier) {
    const _scope = _fileScope('profilesScopesByIdentifier');
    this.logger.debug(_scope, 'called', { identifier });

    try {
      const profileScopesRows = this.statement.profilesScopesByIdentifier.all({ identifier });
      return Database._profilesScopesBuilder(profileScopesRows);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier });
      throw e;
    }
  }


  redeemCode(dbCtx, { codeId, created, isToken, clientId, profile, identifier, scopes, lifespanSeconds, refreshLifespanSeconds, profileData }) {
    const _scope = _fileScope('redeemCode');
    this.logger.debug(_scope, 'called', { codeId, created, isToken, clientId, profile, identifier, scopes, lifespanSeconds, refreshLifespanSeconds, profileData });

    let result, ret = false;
    try {
      if (profileData) {
        profileData = JSON.stringify(profileData);
      }
      this.transaction(dbCtx, () => {
        result = this.statement.redeemCode.get({ codeId, created: common.dateToEpoch(created), isToken: DatabaseSQLite._booleanToNumeric(isToken), clientId, profile, identifier, lifespanSeconds, refreshLifespanSeconds, profileData });
        if (!result) {
          this.logger.error(_scope, 'failed', { result });
          throw new DBErrors.UnexpectedResult('did not redeem code');
        }
        // Abort and return false if redemption resulted in revocation.
        if (result.isRevoked) {
          return;
        }

        // Ensure there are entries for all scopes, and associate with token.
        scopes.forEach((scope) => {
          this.statement.scopeInsert.run({ scope });
          this.statement.tokenScopeSet.run({ codeId, scope });
        });
        ret = true;
      }); // tx
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, codeId, isToken, clientId, profile, identifier, scopes, lifespanSeconds, refreshLifespanSeconds, profileData });
      throw e;
    }
    return ret;
  }


  static _refreshCodeResponseToNative(refreshResponse) {
    if (refreshResponse) {
      ['expires', 'refreshExpires'].forEach((epochField) => {
        if (refreshResponse[epochField]) { // eslint-disable-line security/detect-object-injection
          refreshResponse[epochField] = new Date(Number(refreshResponse[epochField]) * 1000); // eslint-disable-line security/detect-object-injection
        }
      });
    }
    return refreshResponse;
  }


  refreshCode(dbCtx, codeId, refreshed, removeScopes) {
    const _scope = _fileScope('refreshCode');
    this.logger.debug(_scope, 'called', { codeId, refreshed, removeScopes });

    try {
      return this.transaction(dbCtx, () => {
        const refreshResponse = this.statement.refreshCode.get({ codeId, refreshed: common.dateToEpoch(refreshed) });
        if (refreshResponse) {
          removeScopes.forEach((scope) => {
            const result = this.statement.tokenScopeRemove.run({ codeId, scope });
            if (result?.changes != 1) {
              this.logger.error(_scope, 'failed to remove token scope', { codeId, scope });
              throw new DBErrors.UnexpectedResult('did not remove scope from token');
            }
          });
          if (removeScopes.length) {
            refreshResponse.scopes = (this.statement.tokenScopesGetByCodeId.all({ codeId }) || [])
              .map((row) => row.scope);  
          }
        } else {
          this.logger.debug(_scope, 'did not refresh token', {});
        }
        return DatabaseSQLite._refreshCodeResponseToNative(refreshResponse);
      }); // tx
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, codeId, refreshed });
      throw e;
    }
  }


  static _resourceToNative(resource) {
    if (resource) {
      resource.created = new Date(Number(resource.created) * 1000);
    }
    return resource;
  }


  resourceGet(dbCtx, resourceId) {
    const _scope = _fileScope('resourceGet');
    this.logger.debug(_scope, 'called', { resourceId });

    try {
      const resource = this.statement.resourceGet.get({ resourceId });
      return DatabaseSQLite._resourceToNative(resource);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, resourceId });
      throw e;
    }
  }


  resourceUpsert(dbCtx, resourceId, secret, description) {
    const _scope = _fileScope('resourceUpsert');
    this.logger.debug(_scope, 'called', { resourceId });

    try {
      if (!resourceId) {
        resourceId = uuid.v4();
      }
      const result = this.statement.resourceUpsert.run({ resourceId, secret, description });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not upsert resource');
      }
      const resource = this.statement.resourceGet.get({ resourceId });
      return DatabaseSQLite._resourceToNative(resource);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, resourceId, secret, description });
      throw e;
    }
  }


  scopeCleanup(dbCtx, atLeastMsSinceLast) {
    const _scope = _fileScope('scopeCleanup');
    this.logger.debug(_scope, 'called', { atLeastMsSinceLast });

    const almanacEvent = Enum.AlmanacEntry.ScopeCleanup;
    try {
      return this.db.transaction(() => {

        // Check that enough time has passed since last cleanup
        const nowEpoch = BigInt(common.dateToEpoch());
        const { epoch: lastCleanupEpoch } = this.statement.almanacGet.get({ event: almanacEvent }) || { epoch: 0n };
        const elapsedMs = (nowEpoch - lastCleanupEpoch) * 1000n;
        if (elapsedMs < atLeastMsSinceLast) {
          this.logger.debug(_scope, 'skipping token cleanup, too soon', { lastCleanupEpoch, elapsedMs, atLeastMsSinceLast });
          return;
        }

        // Do the cleanup
        const { changes: scopesRemoved } = this.statement.scopeCleanup.run();

        // Update the last cleanup time
        const result = this.statement.almanacUpsert.run({ event: almanacEvent, epoch: nowEpoch });
        if (result.changes != 1) {
          this.constructor._almanacErrorThrow();
        }

        this.logger.debug(_scope, 'finished', { scopesRemoved, atLeastMsSinceLast });
        return scopesRemoved;
      }).exclusive();
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, atLeastMsSinceLast });
      throw e;
    }
  }


  scopeDelete(dbCtx, scope) {
    const _scope = _fileScope('scopeDelete');
    this.logger.debug(_scope, 'called', { scope });

    try {
      return this.transaction(dbCtx, () => {
        const { inUse } = this.statement.scopeInUse.get({ scope });
        if (inUse) {
          this.logger.debug(_scope, 'not deleted, in use', { scope });
          return false;
        }
        const result = this.statement.scopeDelete.run({ scope });
        if (result.changes == 0) {
          this.logger.debug(_scope, 'no such scope', { scope });
        } else {
          this.logger.debug(_scope, 'deleted', { scope });
        }
        return true;
      });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, scope });
      throw e;
    }
  }


  scopeUpsert(dbCtx, scope, application, description, manuallyAdded) {
    const _scope = _fileScope('scopeUpsert');
    this.logger.debug(_scope, 'called', { scope, application, description, manuallyAdded });

    try {
      const result = this.statement.scopeUpsert.run({ scope, application, description, manuallyAdded: DatabaseSQLite._booleanToNumeric(manuallyAdded) });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not upsert scope');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, scope, application, description, manuallyAdded });
      throw e;
    }
  }


  tokenCleanup(dbCtx, codeLifespanSeconds, atLeastMsSinceLast) {
    const _scope = _fileScope('tokenCleanup');
    this.logger.debug(_scope, 'called', { codeLifespanSeconds, atLeastMsSinceLast });

    const almanacEvent = Enum.AlmanacEntry.TokenCleanup;
    try {
      return this.db.transaction(() => {

        // Check that enough time has passed since last cleanup
        const nowEpoch = BigInt(common.dateToEpoch());
        const { epoch: lastCleanupEpoch } = this.statement.almanacGet.get({ event: almanacEvent }) || { epoch: 0n };
        const elapsedMs = (nowEpoch - lastCleanupEpoch) * 1000n;
        if (elapsedMs < atLeastMsSinceLast) {
          this.logger.debug(_scope, 'skipping token cleanup, too soon', { lastCleanupEpoch, elapsedMs, atLeastMsSinceLast });
          return;
        }

        // Do the cleanup
        const { changes: tokensRemoved } = this.statement.tokenCleanup.run({ codeLifespanSeconds });

        // Update the last cleanup time
        const result = this.statement.almanacUpsert.run({ event: almanacEvent, epoch: nowEpoch });
        if (result.changes != 1) {
          this.constructor._almanacErrorThrow();
        }

        this.logger.debug(_scope, 'finished', { tokensRemoved, codeLifespanSeconds, atLeastMsSinceLast });
        return tokensRemoved;
      }).exclusive();
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, codeLifespanSeconds, atLeastMsSinceLast });
      throw e;
    }
  }


  static _tokenToNative(token) {
    if (token) {
      token.created = new Date(Number(token.created) * 1000);
      if (token.expires || token.expires == 0) {
        token.expires = new Date(Number(token.expires) * 1000);
      }
      if (token.refreshExpires || token.refreshExpires == 0) {
        token.refreshExpires = new Date(Number(token.refreshExpires) * 1000);
      }
      if (token.refreshed || token.refreshed == 0) {
        token.refreshed = new Date(Number(token.refreshed) * 1000);
      }
      token.isRevoked = !!token.isRevoked;
      token.isToken = !!token.isToken;
      if (token.profileData) {
        token.profileData = JSON.parse(token.profileData);
      }
    }
    return token;
  }


  tokenGetByCodeId(dbCtx, codeId) {
    const _scope = _fileScope('tokenGetByCodeId');
    this.logger.debug(_scope, 'called', { codeId });

    try {
      return this.transaction(dbCtx, () => {
        const token = this.statement.tokenGetByCodeId.get({ codeId });
        token.scopes = (this.statement.tokenScopesGetByCodeId.all({ codeId }) || [])
          .map((row) => row.scope);
        return DatabaseSQLite._tokenToNative(token);  
      });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, codeId });
      throw e;
    }
  }


  tokenRefreshRevokeByCodeId(dbCtx, codeId) {
    const _scope = _fileScope('tokenRefreshRevokeByCodeId');
    this.logger.debug(_scope, 'called', { codeId });

    try {
      const result = this.statement.tokenRefreshRevokeByCodeId.run({ codeId });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not revoke refresh');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, codeId });
      throw e;
    }
  }


  tokenRevokeByCodeId(dbCtx, codeId) {
    const _scope = _fileScope('tokenRevokeByCodeId');
    this.logger.debug(_scope, 'called', { codeId });

    try {
      const result = this.statement.tokenRevokeByCodeId.run({ codeId });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not revoke token');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, codeId });
      throw e;
    }
  }


  tokensGetByIdentifier(dbCtx, identifier) {
    const _scope = _fileScope('tokensGetByIdentifier');
    this.logger.debug(_scope, 'called', { identifier });

    try {
      const tokens = this.statement.tokensGetByIdentifier.all({ identifier });
      return tokens.map(DatabaseSQLite._tokenToNative);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier });
      throw e;
    }
  }


  ticketRedeemed(dbCtx, redeemedData) {
    const _scope = _fileScope('ticketRedeemed');
    this.logger.debug(_scope, 'called', { ...redeemedData });

    try {
      const result = this.statement.ticketRedeemed.run(redeemedData);
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not store redeemed ticket');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      throw e;
    }
  }


  ticketTokenPublished(dbCtx, redeemedData) {
    const _scope = _fileScope('ticketRedeemed');
    this.logger.debug(_scope, 'called', { ...redeemedData });

    const almanacEvent = Enum.AlmanacEntry.TicketPublished;
    try {
      const result = this.statement.ticketTokenPublished.run(redeemedData);
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not store redeemed ticket');
      }
      const epoch = common.dateToEpoch();
      const almanacResult = this.statement.almanacUpsert.run({ event: almanacEvent, epoch });
      if (almanacResult.changes != 1) {
        this.constructor._almanacErrorThrow();
      }

    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      throw e;
    }
  }

  static _redeemedTicketToNative(redeemedTicket) {
    redeemedTicket.created = new Date(Number(redeemedTicket.created) * 1000);
    if (redeemedTicket.published) {
      redeemedTicket.published = new Date(Number(redeemedTicket.published) * 1000);
    }
    return redeemedTicket;
  }

  ticketTokenGetUnpublished() {
    const _scope = _fileScope('ticketTokenGetUnpublished');
    this.logger.debug(_scope, 'called');

    try {
      const unpublished = this.statement.ticketTokenGetUnpublished.all();
      return unpublished.map((x) => DatabaseSQLite._redeemedTicketToNative(x));
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      throw e;
    }
  }

}

module.exports = DatabaseSQLite;
