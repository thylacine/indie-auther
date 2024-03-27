/* eslint-disable security/detect-object-injection */
'use strict';

const pgpInitOptions = {
  capSQL: true,
};

const path = require('path');
const pgp = require('pg-promise')(pgpInitOptions);
const { unappliedSchemaVersions } = require('../schema-version-helper');
const Database = require('../abstract');
const DBErrors = require('../errors');
const common = require('../../common');
const Enum = require('../../enum');

const _fileScope = common.fileScope(__filename);

const PGTypeIdINT8 = 20; // Type Id 20 == INT8 (BIGINT)
const PGTypeIdINT8Array = 1016; //Type Id 1016 == INT8[] (BIGINT[])
pgp.pg.types.setTypeParser(PGTypeIdINT8, BigInt); // Type Id 20 = INT8 (BIGINT)
const parseBigIntArray = pgp.pg.types.getTypeParser(PGTypeIdINT8Array); // Type Id 1016 = INT8[] (BIGINT[])
pgp.pg.types.setTypeParser(PGTypeIdINT8Array, (a) => parseBigIntArray(a).map(BigInt));

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

class DatabasePostgres extends Database {
  constructor(logger, options, _pgp = pgp) {
    super(logger, options);

    this.db = _pgp(options.db.connectionString);
    this.schemaVersionsSupported = schemaVersionsSupported;

    // Suppress QF warnings when running tests
    this.noWarnings = options.db.noWarnings;

    // Log queries
    const queryLogLevel = options.db.queryLogLevel;
    if (queryLogLevel) {
      const queryScope = _fileScope('pgp:query');
      pgpInitOptions.query = (event) => {
        this.logger[queryLogLevel](queryScope, '', { ...common.pick(event || {}, ['query', 'params']) });
      };
    }

    // Log errors
    const errorScope = _fileScope('pgp:error');
    pgpInitOptions.error = (err, event) => {
      this.logger.error(errorScope, '', { err, event });
    };

    // Deophidiate column names in-place, log results
    pgpInitOptions.receive = ({ data, result, ctx: event }) => {
      const exemplaryRow = data[0];
      for (const prop in exemplaryRow) {
        const camel = common.camelfy(prop);
        if (!(camel in exemplaryRow)) {
          for (const d of data) {
            d[camel] = d[prop];
            delete d[prop];
          }
        }
      }
      if (queryLogLevel) {
        // Omitting .rows
        const resultLog = common.pick(result || {}, ['command', 'rowCount', 'duration']);
        this.logger[queryLogLevel](_fileScope('pgp:result'), '', { query: event.query, ...resultLog });
      }
    };

    // Expose these for test coverage
    this.pgpInitOptions = pgpInitOptions;
    this._pgp = _pgp;

    this._initStatements(_pgp);
  }


  _queryFileHelper(_pgp) {
    return (file) => {
      const _scope = _fileScope('_queryFile');
      /* istanbul ignore next */
      const qfParams = {
        minify: true,
        ...(this.noWarnings && { noWarnings: this.noWarnings }),
      };
      const qf = new _pgp.QueryFile(file, qfParams);
      if (qf.error) {
        this.logger.error(_scope, 'failed to create SQL statement', { error: qf.error, file });
        throw qf.error;
      }
      return qf;
    };
  }


  async initialize(applyMigrations = true) {
    const _scope = _fileScope('initialize');
    this.logger.debug(_scope, 'called', { applyMigrations });
    if (applyMigrations) {
      await this._initTables();
    }
    await super.initialize();
    if (this.listener) {
      await this.listener.start();
    }
  }


  async _initTables(_pgp) {
    const _scope = _fileScope('_initTables');
    this.logger.debug(_scope, 'called', {});

    const _queryFile = this._queryFileHelper(_pgp || this._pgp);

    // Migrations rely upon this table, ensure it exists.
    const metaVersionTable = '_meta_schema_version';

    const tableExists = async (name) => this.db.oneOrNone('SELECT table_name FROM information_schema.tables WHERE table_name=$(name)', { name });
    let metaExists = await tableExists(metaVersionTable);
    if (!metaExists) {
      const fPath = path.join(__dirname, 'sql', 'schema', 'init.sql');
      const initSql = _queryFile(fPath);
      const results = await this.db.multiResult(initSql);
      this.logger.debug(_scope, 'executed init sql', { results });
      metaExists = await tableExists(metaVersionTable);
      /* istanbul ignore if */
      if (!metaExists) {
        throw new DBErrors.UnexpectedResult(`did not create ${metaVersionTable} table`);
      }
      this.logger.info(_scope, 'created schema version table', { metaVersionTable });
    }

    // Apply migrations
    const currentSchema = await this._currentSchema();
    const migrationsWanted = unappliedSchemaVersions(__dirname, currentSchema, this.schemaVersionsSupported);
    this.logger.debug(_scope, 'schema migrations wanted', { migrationsWanted });
    for (const v of migrationsWanted) {
      const fPath = path.join(__dirname, 'sql', 'schema', v, 'apply.sql');
      const migrationSql = _queryFile(fPath);
      const results = await this.db.multiResult(migrationSql);
      this.logger.debug(_scope, 'executed migration sql', { version: v, results });
      this.logger.info(_scope, 'applied migration', { version: v });
    }
  }

  
  _initStatements(_pgp) {
    const _scope = _fileScope('_initStatements');
    const _queryFile = this._queryFileHelper(_pgp);
    this.statement = _pgp.utils.enumSql(path.join(__dirname, 'sql'), {}, _queryFile);
    this.logger.debug(_scope, 'statements initialized', { statements: Object.keys(this.statement).length });
  }

  
  async healthCheck() {
    const _scope = _fileScope('healthCheck');
    this.logger.debug(_scope, 'called', {});
    const c = await this.db.connect();
    c.done();
    return { serverVersion: c.client.serverVersion };
  }


  async _currentSchema() {
    return this.db.one('SELECT major, minor, patch FROM _meta_schema_version ORDER BY major DESC, minor DESC, patch DESC LIMIT 1');
  }

  
  async _closeConnection() {
    const _scope = _fileScope('_closeConnection');
    try {
      if (this.listener) {
        await this.listener.stop();
      }
      await this._pgp.end();
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      throw e;
    }
  }

  
  /* istanbul ignore next */
  async _purgeTables(really = false) {
    const _scope = _fileScope('_purgeTables');
    try {
      if (really) {
        await this.db.tx(async (t) => {
          await t.batch([
            'almanac',
            'authentication',
            'profile',
            'redeemed_ticket',
            'resource',
            'token',
          ].map(async (table) => t.query('TRUNCATE TABLE $(table:name) CASCADE', { table })));
        });
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      throw e;
    }
  }


  async context(fn) {
    return this.db.task(async (t) => fn(t));
  }


  // eslint-disable-next-line class-methods-use-this
  async transaction(dbCtx, fn) {
    return dbCtx.txIf(async (t) => fn(t));
  }


  static _almanacErrorThrow() {
    throw new DBErrors.UnexpectedResult('did not update almanac');
  }


  async almanacGetAll(dbCtx) {
    const _scope = _fileScope('almanacGetAll');
    this.logger.debug(_scope, 'called');

    try {
      return await dbCtx.manyOrNone(this.statement.almanacGetAll);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      throw e;
    }
  }


  async almanacUpsert(dbCtx, event, date) {
    const _scope = _fileScope('almanacUpsert');
    this.logger.debug(_scope, 'called', { event, date });

    try {
      const result = await dbCtx.result(this.statement.almanacUpsert, { event, date: date ?? new Date() });
      if (result.rowCount != 1) {
        this.constructor._almanacErrorThrow();
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, event, date });
      throw e;
    }
  }


  async authenticationGet(dbCtx, identifier) {
    const _scope = _fileScope('authenticationGet');
    this.logger.debug(_scope, 'called', { identifier });

    try {
      return await dbCtx.oneOrNone(this.statement.authenticationGet, { identifier });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier });
      throw e;
    }
  }


  async authenticationSuccess(dbCtx, identifier) {
    const _scope = _fileScope('authenticationSuccess');
    this.logger.debug(_scope, 'called', { identifier });

    try {
      const result = await dbCtx.result(this.statement.authenticationSuccess, { identifier });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not update authentication success event');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier });
      throw e;
    }
  }


  async authenticationUpsert(dbCtx, identifier, credential, otpKey) {
    const _scope = _fileScope('authenticationUpsert');
    const scrubbedCredential = '*'.repeat((credential || '').length);
    const scrubbedOTPKey = '*'.repeat((otpKey || '').length);
    this.logger.debug(_scope, 'called', { identifier, scrubbedCredential, scrubbedOTPKey });

    try {
      const result = await dbCtx.result(this.statement.authenticationUpsert, { identifier, credential, otpKey });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not upsert authentication');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier, scrubbedCredential, scrubbedOTPKey });
      throw e;
    }
  }


  async authenticationUpdateOTPKey(dbCtx, identifier, otpKey = null) {
    const _scope = _fileScope('authenticationUpdateOTPKey');
    const scrubbedOTPKey = '*'.repeat((otpKey || '').length);
    this.logger.debug(_scope, 'called', { identifier, scrubbedOTPKey });

    try {
      const result = await dbCtx.result(this.statement.authenticationUpdateOtpKey, { identifier, otpKey });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not update otpKey');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier, scrubbedOTPKey });
      throw e;
    }
  }


  async authenticationUpdateCredential(dbCtx, identifier, credential) {
    const _scope = _fileScope('authenticationUpdateCredential');
    const scrubbedCredential = '*'.repeat((credential || '').length);
    this.logger.debug(_scope, 'called', { identifier, scrubbedCredential });

    try {
      const result = await dbCtx.result(this.statement.authenticationUpdateCredential, { identifier, credential });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not update credential');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier, scrubbedCredential });
      throw e;
    }

  }


  async profileIdentifierInsert(dbCtx, profile, identifier) {
    const _scope = _fileScope('profileIdentifierInsert');
    this.logger.debug(_scope, 'called', { profile, identifier });

    try {
      const result = await dbCtx.result(this.statement.profileIdentifierInsert, { profile, identifier });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not insert identifier');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, profile, identifier });
      throw e;
    }
  }


  async profileIsValid(dbCtx, profile) {
    const _scope = _fileScope('profileIsValid');
    this.logger.debug(_scope, 'called', { profile });

    try {
      const profileResponse = await dbCtx.oneOrNone(this.statement.profileGet, { profile });
      return !!profileResponse;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, profile });
      throw e;
    }
  }


  async profileScopeInsert(dbCtx, profile, scope) {
    const _scope = _fileScope('profileScopeInsert');
    this.logger.debug(_scope, 'called', { profile, scope });

    try {
      const result = await dbCtx.result(this.statement.profileScopeInsert, { profile, scope });
      // Duplicate inserts get ignored
      if (result.rowCount != 1 && result.rowCount != 0) {
        throw new DBErrors.UnexpectedResult('did not insert profile scope');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, profile, scope });
      throw e;
    }
  }


  async profileScopesSetAll(dbCtx, profile, scopes) {
    const _scope = _fileScope('profileScopesSetAll');
    this.logger.debug(_scope, 'called', { profile, scopes });

    try {
      await this.transaction(dbCtx, async (txCtx) => {
        await txCtx.result(this.statement.profileScopesClear, { profile });
        if (scopes.length) {
          await txCtx.result(this.statement.profileScopesSetAll, { profile, scopes });
        }
      }); // transaction
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, profile, scopes });
      throw e;
    }
  }


  async profilesScopesByIdentifier(dbCtx, identifier) {
    const _scope = _fileScope('profilesScopesByIdentifier');
    this.logger.debug(_scope, 'called', { identifier });

    try {
      const profileScopesRows = await dbCtx.manyOrNone(this.statement.profilesScopesByIdentifier, { identifier });
      return Database._profilesScopesBuilder(profileScopesRows);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier });
      throw e;
    }
  }


  async redeemCode(dbCtx, { codeId, created, isToken, clientId, profile, identifier, scopes, lifespanSeconds, refreshLifespanSeconds, resource, profileData }) {
    const _scope = _fileScope('redeemCode');
    this.logger.debug(_scope, 'called', { codeId, created, isToken, clientId, profile, identifier, scopes, lifespanSeconds, refreshLifespanSeconds, resource, profileData });

    let result, ret = false;
    try {
      await this.transaction(dbCtx, async (txCtx) => {
        result = await txCtx.result(this.statement.redeemCode, { codeId, created, isToken, clientId, profile, identifier, lifespanSeconds, refreshLifespanSeconds, resource, profileData });
        if (result.rowCount != 1) {
          this.logger.error(_scope, 'failed', { result });
          throw new DBErrors.UnexpectedResult('did not redeem code');
        }
        // Abort and return false if redemption resulted in revocation.
        if (result.rows[0].isRevoked) {
          return;
        }
        this.logger.debug(_scope, 'code redeemed', { redeemed: result.rows[0] });

        // Ensure there are entries for all scopes.
        if (scopes.length !== 0) {
          await txCtx.result(this.statement.scopesInsert, { scopes });
        }

        // Record accepted scopes for this token.
        result = await txCtx.result(this.statement.tokenScopesSet, { codeId, scopes });
        if (result.rowCount != scopes.length) {
          this.logger.error(_scope, 'token scope count mismatch', { codeId, scopes, result });
          throw new DBErrors.UnexpectedResult('did not set all scopes on token');
        }
        ret = true;
      }); // txCtx
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, codeId, created, isToken, clientId, profile, identifier, scopes, lifespanSeconds, refreshLifespanSeconds, profileData });
      throw e;
    }

    return ret;
  }


  async refreshCode(dbCtx, codeId, refreshed, removeScopes) {
    const _scope = _fileScope('refreshCode');
    this.logger.debug(_scope, 'called', { codeId, refreshed, removeScopes });

    try {
      return await this.transaction(dbCtx, async (txCtx) => {
        const refreshedToken = await txCtx.oneOrNone(this.statement.refreshCode, { codeId, refreshed });
        if (refreshedToken) {
          if (removeScopes.length) {
            const removeResult = await txCtx.result(this.statement.tokenScopesRemove, { codeId, removeScopes });
            if (removeResult.rowCount != removeScopes.length) {
              this.logger.error(_scope, 'failed to remove token scopes', { actual: removeResult.rowCount, expected: removeScopes.length });
              throw new DBErrors.UnexpectedResult('did not remove scopes from token');
            }
          } else {
            delete refreshedToken.scopes; // Not updated, remove from response.
          }
        } else {
          this.logger.debug(_scope, 'did not refresh token', {});
        }
        return refreshedToken;
      });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, codeId });
      throw e;
    }
  }


  async resourceGet(dbCtx, resourceId) {
    const _scope = _fileScope('resourceGet');
    this.logger.debug(_scope, 'called', { resourceId });

    try {
      return await dbCtx.oneOrNone(this.statement.resourceGet, { resourceId });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, resourceId });
      throw e;
    }
  }


  async resourceUpsert(dbCtx, resourceId, secret, description) {
    const _scope = _fileScope('resourceUpsert');
    const logSecret = secret?.length && common.logTruncate('*'.repeat(secret.length), 3) || undefined;
    this.logger.debug(_scope, 'called', { resourceId, secret: logSecret, description });

    try {
      const result = await dbCtx.result(this.statement.resourceUpsert, { resourceId, secret, description });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not upsert resource');
      }
      return result.rows[0];
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, resourceId, secret: logSecret, description });
      throw e;
    }
  }


  async scopeCleanup(dbCtx, atLeastMsSinceLast) {
    const _scope = _fileScope('scopeCleanup');
    this.logger.debug(_scope, 'called', { atLeastMsSinceLast });

    const almanacEvent = Enum.AlmanacEntry.ScopeCleanup;
    try {
      return await this.transaction(dbCtx, async (txCtx) => {

        // Check that enough time has passed since last cleanup
        const now = new Date();
        const cleanupNotAfter = new Date(now.getTime() - atLeastMsSinceLast);
        const { date: lastCleanupDate } = await txCtx.oneOrNone(this.statement.almanacGet, { event: almanacEvent }) || { date: new Date(0) };
        if (lastCleanupDate >= cleanupNotAfter) {
          this.logger.debug(_scope, 'skipping token cleanup, too soon', { lastCleanupDate, cleanupNotAfter, atLeastMsSinceLast });
          return;
        }

        // Do the cleanup
        const { rowCount: scopesRemoved } = await txCtx.result(this.statement.scopeCleanup);

        // Update the last cleanup time
        const result = await txCtx.result(this.statement.almanacUpsert, { event: almanacEvent, date: now });
        if (result.rowCount != 1) {
          this.constructor._almanacErrorThrow();
        }

        this.logger.debug(_scope, 'completed', { scopesRemoved, atLeastMsSinceLast });
        return scopesRemoved;
      }); // tx

    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, atLeastMsSinceLast });
      throw e;
    }
  }


  async scopeDelete(dbCtx, scope) {
    const _scope = _fileScope('scopeDelete');
    this.logger.debug(_scope, 'called', { scope });

    try {
      return await this.transaction(dbCtx, async (txCtx) => {
        const { inUse } = await txCtx.one(this.statement.scopeInUse, { scope });
        if (inUse) {
          this.logger.debug(_scope, 'not deleted, in use', { scope });
          return false;
        }
        const result = await txCtx.result(this.statement.scopeDelete, { scope });
        if (result.rowCount == 0) {
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


  async scopeUpsert(dbCtx, scope, application, description, manuallyAdded = false) {
    const _scope = _fileScope('scopeUpsert');
    this.logger.debug(_scope, 'called', { scope, description });

    try {
      const result = await dbCtx.result(this.statement.scopeUpsert, { scope, application, description, manuallyAdded });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not upsert scope');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, scope, application, description });
      throw e;
    }
  }


  async tokenCleanup(dbCtx, codeLifespanSeconds, atLeastMsSinceLast) {
    const _scope = _fileScope('tokenCleanup');
    this.logger.debug(_scope, 'called', { codeLifespanSeconds, atLeastMsSinceLast });

    const almanacEvent = Enum.AlmanacEntry.TokenCleanup;
    try {
      return await this.transaction(dbCtx, async (txCtx) => {

        // Check that enough time has passed since last cleanup
        const now = new Date();
        const cleanupNotAfter = new Date(now.getTime() - atLeastMsSinceLast);
        const { date: lastCleanupDate } = await txCtx.oneOrNone(this.statement.almanacGet, { event: almanacEvent }) || { date: new Date(0) };
        if (lastCleanupDate >= cleanupNotAfter) {
          this.logger.debug(_scope, 'skipping token cleanup, too soon', { lastCleanupDate, cleanupNotAfter, codeLifespanSeconds, atLeastMsSinceLast });
          return;
        }

        // Do the cleanup
        const { rowCount: tokensRemoved } = await txCtx.result(this.statement.tokenCleanup, { codeLifespanSeconds });

        // Update the last cleanup time
        const result = await txCtx.result(this.statement.almanacUpsert, { event: almanacEvent, date: now });
        if (result.rowCount != 1) {
          this.constructor._almanacErrorThrow();
        }

        this.logger.debug(_scope, 'completed', { tokensRemoved, codeLifespanSeconds, atLeastMsSinceLast });
        return tokensRemoved;
      }); // tx

    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, atLeastMsSinceLast });
      throw e;
    }
  }


  async tokenGetByCodeId(dbCtx, codeId) {
    const _scope = _fileScope('tokenGetByCodeId');
    this.logger.debug(_scope, 'called', { codeId });

    try {
      return await dbCtx.oneOrNone(this.statement.tokenGetByCodeId, { codeId });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, codeId });
      throw e;
    }
  }


  async tokenRevokeByCodeId(dbCtx, codeId) {
    const _scope = _fileScope('tokenRevokeByCodeId');
    this.logger.debug(_scope, 'called', { codeId });

    try {
      const result = await dbCtx.result(this.statement.tokenRevokeByCodeId, { codeId });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not revoke token');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, codeId });
      throw e;
    }
  }


  async tokenRefreshRevokeByCodeId(dbCtx, codeId) {
    const _scope = _fileScope('tokenRefreshRevokeByCodeId');
    this.logger.debug(_scope, 'called', { codeId });

    try {
      const result = await dbCtx.result(this.statement.tokenRefreshRevokeByCodeId, { codeId });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not revoke token');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, codeId });
      throw e;
    }
  }


  async tokensGetByIdentifier(dbCtx, identifier) {
    const _scope = _fileScope('tokensGetByIdentifier');
    this.logger.debug(_scope, 'called', { identifier });

    try {
      return await dbCtx.manyOrNone(this.statement.tokensGetByIdentifier, { identifier });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier });
      throw e;
    }
  }


  async ticketRedeemed(dbCtx, redeemedData) {
    const _scope = _fileScope('ticketRedeemed');
    this.logger.debug(_scope, 'called', { ...redeemedData });

    try {
      const result = await dbCtx.result(this.statement.ticketRedeemed, redeemedData);
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not store redeemed ticket');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, ...redeemedData });
      throw e;
    }
  }


  async ticketTokenPublished(dbCtx, redeemedData) {
    const _scope = _fileScope('ticketRedeemed');
    this.logger.debug(_scope, 'called', { ...redeemedData });

    const almanacEvent = Enum.AlmanacEntry.TicketPublished;
    try {
      const result = await dbCtx.result(this.statement.ticketTokenPublished, redeemedData);
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not store redeemed ticket');
      }
      const almanacResult = await dbCtx.result(this.statement.almanacUpsert, { event: almanacEvent, date: new Date() });
      if (almanacResult.rowCount != 1) {
        this.constructor._almanacErrorThrow();
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, ...redeemedData });
      throw e;
    }
  }

  async ticketTokenGetUnpublished(dbCtx) {
    const _scope = _fileScope('ticketTokenGetUnpublished');
    this.logger.debug(_scope, 'called');

    try {
      return await dbCtx.manyOrNone(this.statement.ticketTokenGetUnpublished);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      throw e;
    }
  }

}

module.exports = DatabasePostgres;
