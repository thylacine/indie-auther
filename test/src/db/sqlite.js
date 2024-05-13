/* eslint-disable sonarjs/no-duplicate-string */
'use strict';

/* This provides implementation coverage, stubbing parts of better-sqlite3. */

const assert = require('assert');
const sinon = require('sinon');
const StubDatabase = require('../../stub-db');
const StubLogger = require('../../stub-logger');
const DB = require('../../../src/db/sqlite');
const DBErrors = require('../../../src/db/errors');
const common = require('../../../src/common');
const Config = require('../../../config');

const expectedException = new Error('oh no');

describe('DatabaseSQLite', function () {
  let db, options, logger, stubDb;
  let dbCtx;
  before(function () {
    logger = new StubLogger();
    logger._reset();
    stubDb = new StubDatabase();
  });
  beforeEach(function () {
    options = new Config('test');
    options.db.connectionString = 'sqlite://:memory:';
    db = new DB(logger, options);
    dbCtx = db.db;
  });
  afterEach(function () {
    sinon.restore();
  });

  it('covers constructor options', function () {
    delete options.db.connectionString;
    db = new DB(logger, options);
  });

  // Ensure all interface methods are implemented
  describe('Implementation', function () {
    it('implements interface', async function () {
      const results = await Promise.allSettled(stubDb._implementation.map((fn) => {
        try {
          // eslint-disable-next-line security/detect-object-injection
          db[fn](db.db);
        } catch (e) {
          assert(!(e instanceof DBErrors.NotImplemented), `${fn} not implemented`);
        }
      }));
      const failures = results.filter((x) => x.status === 'rejected');
      assert(!failures.length, failures.map((x) => {
        x = x.reason.toString();
        return x.slice(x.indexOf(': '));
      }));
    });
  }); // Implementation

  describe('_currentSchema', function () {
    it('covers', function () {
      const version = { major: 1, minor: 0, patch: 0 };
      sinon.stub(db.db, 'prepare').returns({
        get: () => version,
      });
      const result = db._currentSchema();
      assert.deepStrictEqual(result, version);
    });
  }); // _currentSchema

  describe('_closeConnection', function () {
    it('success', function () {
      sinon.stub(db.db, 'close');
      db._closeConnection();
      assert(db.db.close.called);
    });
    it('failure', function () {
      sinon.stub(db.db, 'close').throws(expectedException);
      assert.throws(() => db._closeConnection(), expectedException);
    });
  }); // _closeConnection

  describe('_purgeTables', function () {
    beforeEach(function () {
      sinon.stub(db.db, 'prepare').returns({
        run: sinon.stub(),
      });
    });
    it('covers not really', function () {
      db._purgeTables(false);
      assert(!db.db.prepare.called);
    });
    it('success', function () {
      db._purgeTables(true);
      assert(db.db.prepare.called);
    });
    it('failure', function () {
      db.db.prepare.restore();
      sinon.stub(db.db, 'prepare').throws(expectedException);
      assert.throws(() => db._purgeTables(true), expectedException);
    });
  }); // _purgeTables

  describe('_optimize', function () {
    beforeEach(function () {
      sinon.stub(db.statement._optimize, 'all');
      sinon.stub(db.db, 'pragma');
    });
    it('covers', function () {
      db.changesSinceLastOptimize = BigInt(20);
      db._optimize();
      assert(db.db.pragma.called);
      assert(db.statement._optimize.all.called);
      assert.strictEqual(db.changesSinceLastOptimize, 0n);
    });
  }); // _optimize

  describe('_updateChanges', function () {
    let dbResult;
    beforeEach(function () {
      dbResult = {
        changes: 4,
      };
      sinon.stub(db, '_optimize');
    });
    it('does not optimize if not wanted', function () {
      db.optimizeAfterChanges = 0n;
      db._updateChanges(dbResult);
      assert(db._optimize.notCalled);
    });
    it('does not optimize if under threshold', function () {
      db.optimizeAfterChanges = 100n;
      db._updateChanges(dbResult);
      assert(db._optimize.notCalled);
    });
    it('optimizes over threshold', function () {
      db.optimizeAfterChanges = 1n;
      db._updateChanges(dbResult);
      assert(db._optimize.called);
    });
  }); // _updateChanges

  describe('_deOphidiate', function () {
    it('covers non-array', function () {
      const obj = {
        'snake_case': 1,
      };
      const expected = {
        snakeCase: 1,
      };
      const result = DB._deOphidiate(obj);
      assert.deepStrictEqual(result, expected);
    });
    it('covers array', function () {
      const rows = [
        {
          'snek_field': 'foo',
        },
        {
          'snek_field': 'bar',
        },
      ];
      const expected = [
        {
          snekField: 'foo',
        },
        {
          snekField: 'bar',
        },
      ];
      const result = DB._deOphidiate(rows);
      assert.deepStrictEqual(result, expected);
    });
  }); // _deOphidiate

  describe('healthCheck', function () {
    it('covers', function () {
      db.healthCheck();
    });
    it('covers failure', function () {
      db.db = { open: false };
      assert.throws(() => db.healthCheck(), DBErrors.UnexpectedResult);
    });
  }); // healthCheck

  describe('context', function () {
    it('covers', function () {
      db.context(common.nop);
    });
  }); // context

  describe('transaction', function () {
    it('covers', function () {
      db.transaction(db.db, common.nop);
    });
    it('covers no context', function () {
      db.transaction(undefined, common.nop);
    });
  }); // transaction

  describe('almanacGetAll', function () {
    beforeEach(function () {
      sinon.stub(db.statement.almanacGetAll, 'all');
    });
    it('success', function () {
      const dbResult = [{ event: 'someEvent', epoch: '1668887796' } ];
      const expected = [{ event: 'someEvent', date: new Date('Sat Nov 19 11:56:36 AM PST 2022') }];
      db.statement.almanacGetAll.all.returns(dbResult);
      const result = db.almanacGetAll(dbCtx);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', function () {
      db.statement.almanacGetAll.all.throws(expectedException);
      assert.throws(() => db.almanacGetAll(dbCtx), expectedException);
    });
  }); // almanacGetAll

  describe('almanacUpsert', function () {
    let event, date, dbResult;
    beforeEach(function () {
      event = 'test_event';
      date = new Date('Fri Dec 22 03:27 UTC 2023');
      sinon.stub(db.statement.almanacUpsert, 'run');
      dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
    });
    it('success', function () {
      db.statement.almanacUpsert.run.returns(dbResult);
      db.almanacUpsert(dbCtx, event, date);
    });
    it('success with default date', function () {
      db.statement.almanacUpsert.run.returns(dbResult);
      db.almanacUpsert(dbCtx, event);
    });
    it('failure', function () {
      dbResult.changes = 0;
      db.statement.almanacUpsert.run.returns(dbResult);
      assert.throws(() => db.almanacUpsert(dbCtx, { event, date }), DBErrors.UnexpectedResult);
    });
  }); // almanacUpsert

  describe('authenticationGet', function () {
    let identifier, credential;
    beforeEach(function () {
      identifier = 'username';
      credential = '$z$foo';
      sinon.stub(db.statement.authenticationGet, 'get');
    });
    it('success', function() {
      const expected = {
        identifier,
        credential,
      };
      db.statement.authenticationGet.get.returns(expected);
      const result = db.authenticationGet(dbCtx, identifier);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', function () {
      db.statement.authenticationGet.get.throws(expectedException);
      assert.throws(() => db.authenticationGet(dbCtx, identifier), expectedException);
    });
  }); // authenticationGet

  describe('authenticationSuccess', function () {
    let dbResult, identifier;
    beforeEach(function () {
      identifier = 'username';
      sinon.stub(db.statement.authenticationSuccess, 'run');
      dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
    });
    it('success', function() {
      db.statement.authenticationSuccess.run.returns(dbResult);
      db.authenticationSuccess(dbCtx, identifier);
    });
    it('failure', function () {
      dbResult.changes = 0;
      db.statement.authenticationSuccess.run.returns(dbResult);
      assert.throws(() => db.authenticationSuccess(dbCtx, identifier), DBErrors.UnexpectedResult);
    });
  }); // authenticationSuccess

  describe('authenticationUpsert', function () {
    let identifier, credential;
    beforeEach(function () {
      identifier = 'username';
      credential = '$z$foo';
    });
    it('success', function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.authenticationUpsert, 'run').returns(dbResult);
      db.authenticationUpsert(dbCtx, identifier, credential);
    });
    it('failure', function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.authenticationUpsert, 'run').returns(dbResult);
      assert.throws(() => db.authenticationUpsert(dbCtx, identifier, credential), DBErrors.UnexpectedResult);
    });
  }); // authenticationUpsert

  describe('authenticationUpdateCredential', function () {
    let identifier, credential;
    beforeEach(function () {
      identifier = 'username';
      credential = '$z$foo';
    });
    it('success', function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.authenticationUpdateCredential, 'run').returns(dbResult);
      db.authenticationUpdateCredential(dbCtx, identifier, credential);
    });
    it('failure', function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.authenticationUpdateCredential, 'run').returns(dbResult);
      assert.throws(() => db.authenticationUpdateCredential(dbCtx, identifier, credential), DBErrors.UnexpectedResult);
    });
  }); // authenticationUpdateCredential

  describe('authenticationUpdateOTPKey', function () {
    let identifier, otpKey;
    beforeEach(function () {
      identifier = 'username';
      otpKey = '1234567890123456789012';
    });
    it('success', function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.authenticationUpdateOtpKey, 'run').returns(dbResult);
      db.authenticationUpdateOTPKey(dbCtx, identifier, otpKey);
    });
    it('failure', function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.authenticationUpdateOtpKey, 'run').returns(dbResult);
      assert.throws(() => db.authenticationUpdateOTPKey(dbCtx, identifier, otpKey), DBErrors.UnexpectedResult);
    });
  }); // authenticationUpdateOTPKey

  describe('profileIdentifierInsert', function () {
    let profile, identifier;
    beforeEach(function () {
      profile = 'https://profile.example.com/';
      identifier = 'identifier';
      sinon.stub(db.statement.profileIdentifierInsert, 'run');
    });
    it('success', function () {
      db.statement.profileIdentifierInsert.run.returns({ changes: 1 });
      db.profileIdentifierInsert(dbCtx, profile, identifier);
    });
    it('failure', function () {
      db.statement.profileIdentifierInsert.run.returns({ changes: 0 });
      assert.throws(() => db.profileIdentifierInsert(dbCtx, profile, identifier), DBErrors.UnexpectedResult);
    });
  }); // profileIdentifierInsert

  describe('profileScopeInsert', function () {
    let profile, scope;
    beforeEach(function () {
      profile = 'https://profile.example.com/';
      scope = 'scope';
      sinon.stub(db.statement.profileScopeInsert, 'run');
    });
    it('success', function () {
      db.statement.profileScopeInsert.run.returns({ changes: 1 });
      db.profileScopeInsert(dbCtx, profile, scope);
    });
    it('failure', function () {
      db.statement.profileScopeInsert.run.returns({ changes: 2 });
      assert.throws(() => db.profileScopeInsert(dbCtx, profile, scope), DBErrors.UnexpectedResult);
    });
  }); // profileScopeInsert

  describe('profileIsValid', function () {
    let profile;
    beforeEach(function () {
      profile = 'https://profile.exmaple.com';
    });
    it('valid profile', function () {
      sinon.stub(db.statement.profileGet, 'get').returns({ profile });
      const result = db.profileIsValid(dbCtx, profile);
      assert.deepStrictEqual(result, true);
    });
    it('invalid profile', function () {
      sinon.stub(db.statement.profileGet, 'get').returns();
      const result = db.profileIsValid(dbCtx, profile);
      assert.deepStrictEqual(result, false);
    });
    it('failure', function() {
      sinon.stub(db.statement.profileGet, 'get').throws(expectedException);
      assert.throws(() => db.profileIsValid(dbCtx, profile), expectedException);
    });
  }); // profileIsValid

  describe('profilesScopesByIdentifier', function () {
    let identifier, scopeIndex, profileScopes, profiles;
    beforeEach(function  () {
      identifier = 'identifier';
      scopeIndex = {
        'scope': {
          description: 'A scope.',
          application: 'test',
          isPermanent: false,
          isManuallyAdded: false,
          profiles: ['https://first.example.com/', 'https://second.example.com/'],
        },
        'another_scope': {
          description: 'Another scope.',
          application: 'another test',
          isPermanent: false,
          isManuallyAdded: false,
          profiles: ['https://first.example.com/'],
        },
      };
      profileScopes = {
        'https://first.example.com/': {
          'scope': scopeIndex['scope'],
          'another_scope': scopeIndex['another_scope'],
        },
        'https://second.example.com/': {
          'scope': scopeIndex['scope'],
        },
      };
      profiles = ['https://first.example.com/', 'https://second.example.com/'];
    });
    it('success', function () {
      const dbResult = [
        { profile: 'https://first.example.com/', scope: 'scope', application: 'test', description: 'A scope.', isPermanent: false, isManuallyAdded: false },
        { profile: 'https://first.example.com/', scope: 'another_scope', application: 'another test', description: 'Another scope.', isPermanent: false, isManuallyAdded: false  },
        { profile: 'https://second.example.com/', scope: 'scope', application: 'test', description: 'A scope.', isPermanent: false, isManuallyAdded: false  },
      ];
      const expected = {
        scopeIndex,
        profileScopes,
        profiles,
      };
      sinon.stub(db.statement.profilesScopesByIdentifier, 'all').returns(dbResult);
      const result = db.profilesScopesByIdentifier(dbCtx, identifier);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', function() {
      sinon.stub(db.statement.profilesScopesByIdentifier, 'all').throws(expectedException);
      assert.throws(() => db.profilesScopesByIdentifier(dbCtx, identifier), expectedException);
    });
  }); // profilesScopesByIdentifier

  describe('profileScopesSetAll', function () {
    let profile, scopes;
    beforeEach(function () {
      profile = 'https://example.com/';
      scopes = ['scope1', 'scope2'];
      sinon.stub(db.statement.profileScopesClear, 'run').returns();
      sinon.stub(db.statement.profileScopeInsert, 'run');
    });
    it('success, no scopes', function () {
      db.statement.profileScopeInsert.run.returns();
      scopes = [];
      db.profileScopesSetAll(dbCtx, profile, scopes);
    });
    it('success, scopes', function () {
      db.statement.profileScopeInsert.run.returns();
      scopes.push('profile', 'email', 'create');
      db.profileScopesSetAll(dbCtx, profile, scopes);
    });
    it('failure', function () {
      db.statement.profileScopeInsert.run.throws(expectedException);
      assert.throws(() => db.profileScopesSetAll(dbCtx, profile, scopes), expectedException);
    });

  }); // profileScopesSetAll

  describe('redeemCode', function () {
    let codeId, created, isToken, clientId, profile, identifier, scopes, lifespanSeconds, profileData;
    beforeEach(function () {
      codeId = '2f226616-3e79-11ec-ad0f-0025905f714a';
      isToken = false;
      clientId = 'https://app.exmaple.com/';
      profile = 'https://profile.example.com/';
      identifier = 'username';
      scopes = ['scope1', 'scope2'];
      lifespanSeconds = 600;
      profileData = undefined;
      created = new Date();

      sinon.stub(db.statement.scopeInsert, 'run');
      sinon.stub(db.statement.tokenScopeSet, 'run');
      sinon.stub(db.statement.redeemCode, 'get');
    });
    it('success', function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const dbGet = {
        isRevoked: false,
      };
      db.statement.scopeInsert.run.returns(dbResult);
      db.statement.tokenScopeSet.run.returns(dbResult);
      db.statement.redeemCode.get.returns(dbGet);
      profileData = {
        name: 'Some Name',
      };
      const result = db.redeemCode(dbCtx, { codeId, created, isToken, clientId, profile, identifier, scopes, lifespanSeconds, profileData });
      assert.strictEqual(result, true);
    });
    it('success (revoked)', function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const dbGet = {
        isRevoked: true,
      };
      db.statement.scopeInsert.run.returns(dbResult);
      db.statement.tokenScopeSet.run.returns(dbResult);
      db.statement.redeemCode.get.returns(dbGet);
      const result = db.redeemCode(dbCtx, { codeId, created, isToken, clientId, profile, identifier, scopes, lifespanSeconds, profileData });
      assert.strictEqual(result, false);
    });
    it('failure', function () {
      db.statement.scopeInsert.run.throws();
      db.statement.tokenScopeSet.run.throws();
      db.statement.redeemCode.get.returns();
      assert.throws(() => db.redeemCode(dbCtx, { codeId, created, isToken, clientId, profile, identifier, scopes, lifespanSeconds }), DBErrors.UnexpectedResult);
    });
  }); // redeemCode

  describe('refreshCode', function () {
    let refreshResponse, removeResponse, scopesResponse, codeId, refreshed, removeScopes;
    beforeEach(function () {
      sinon.stub(db.statement.refreshCode, 'get');
      sinon.stub(db.statement.tokenScopeRemove, 'run');
      sinon.stub(db.statement.tokenScopesGetByCodeId, 'all');
      codeId = '73db7b18-27bb-11ed-8edd-0025905f714a';
      refreshed = new Date();
      removeScopes = ['foop'];
      const refreshedEpoch = Math.ceil(refreshed.getTime() / 1000);
      refreshResponse = {
        expires: refreshedEpoch + 86400,
        refreshExpires: refreshedEpoch + 172800,
      };
      removeResponse = {
        changes: removeScopes.length,
      };
      scopesResponse = [
        { scope: 'blah' },
      ];
    });
    it('success', function () {
      db.statement.refreshCode.get.returns(refreshResponse);
      db.statement.tokenScopeRemove.run.returns(removeResponse);
      db.statement.tokenScopesGetByCodeId.all.returns(scopesResponse);
      const expectedResponse = {
        expires: new Date(refreshResponse.expires * 1000),
        refreshExpires: new Date(refreshResponse.refreshExpires * 1000),
        scopes: ['blah'],
      };
      const response = db.refreshCode(dbCtx, codeId, refreshed, removeScopes);
      assert.deepStrictEqual(response, expectedResponse);
    });
    it('success without scope removal', function () {
      db.statement.refreshCode.get.returns(refreshResponse);
      db.statement.tokenScopeRemove.run.returns(removeResponse);
      const expectedResponse = {
        expires: new Date(refreshResponse.expires * 1000),
        refreshExpires: new Date(refreshResponse.refreshExpires * 1000),
      };
      removeScopes = [];
      const response = db.refreshCode(dbCtx, codeId, refreshed, removeScopes);
      assert.deepStrictEqual(response, expectedResponse);
    });
    it('success with no scopes left', function () {
      db.statement.refreshCode.get.returns(refreshResponse);
      db.statement.tokenScopeRemove.run.returns(removeResponse);
      const expectedResponse = {
        expires: new Date(refreshResponse.expires * 1000),
        refreshExpires: new Date(refreshResponse.refreshExpires * 1000),
        scopes: [],
      };
      const response = db.refreshCode(dbCtx, codeId, refreshed, removeScopes);
      assert.deepStrictEqual(response, expectedResponse);
    });
    it('no code', function () {
      db.statement.refreshCode.get.returns();
      removeResponse.changes = 0;
      db.statement.tokenScopeRemove.run.returns();
      const expectedResponse = undefined;
      const response = db.refreshCode(dbCtx, codeId, refreshed, removeScopes);
      assert.deepStrictEqual(response, expectedResponse);
    });
    it('failure', function () {
      db.statement.refreshCode.get.throws(expectedException);
      assert.throws(() => db.refreshCode(dbCtx, codeId, refreshed, removeScopes), expectedException);
    });
    it('scope removal failure', function () {
      removeResponse.changes = 0;
      db.statement.tokenScopeRemove.run.returns(removeResponse);
      db.statement.refreshCode.get.returns(refreshResponse);
      assert.throws(() => db.refreshCode(dbCtx, codeId, refreshed, removeScopes), DBErrors.UnexpectedResult);
    });

    describe('_refreshCodeResponseToNative', function () {
      it('coverage', function () {
        const expected = { foo: 'bar' };
        const result = DB._refreshCodeResponseToNative(expected);
        assert.deepStrictEqual(result, expected);
      });
      it('coverage', function () {
        const result = DB._refreshCodeResponseToNative();
        assert.strictEqual(result, undefined);
      });
    });
  }); // refreshCode

  describe('resourceGet', function () {
    let identifier;
    beforeEach(function () {
      sinon.stub(db.statement.resourceGet, 'get');
      identifier = '05b81112-b224-11ec-a9c6-0025905f714a';
    });
    it('success', function () {
      const dbResult = {
        identifier,
        secret: 'secrety',
      };
      db.statement.resourceGet.get.returns(dbResult);
      const result = db.resourceGet(dbCtx, identifier);
      assert.deepStrictEqual(result, dbResult);
    });
    it('failure', function() {
      db.statement.resourceGet.get.throws(expectedException);
      assert.throws(() => db.resourceGet(dbCtx, identifier), expectedException);
    });
  }); // resourceGet

  describe('resourceUpsert', function () {
    let resourceId, secret, description;
    beforeEach(function () {
      resourceId = '4086661a-f980-11ec-ba19-0025905f714a';
      secret = 'secret';
      description = 'some application';
    });
    it('success', function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.resourceUpsert, 'run').returns(dbResult);
      db.resourceUpsert(dbCtx, resourceId, secret, description);
    });
    it('creates id if not provided', function () {
      resourceId = undefined;
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.resourceUpsert, 'run').returns(dbResult);
      db.resourceUpsert(dbCtx, resourceId, secret, description);
    });
    it('failure', function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.resourceUpsert, 'run').returns(dbResult);
      assert.throws(() => db.resourceUpsert(dbCtx, resourceId, secret, description), DBErrors.UnexpectedResult);
    });
  }); // resourceUpsert

  describe('scopeCleanup', function () {
    let atLeastMsSinceLast;
    beforeEach(function () {
      atLeastMsSinceLast = 86400000;
      sinon.stub(db.statement.scopeCleanup, 'run');
      sinon.stub(db.statement.almanacGet, 'get');
      sinon.stub(db.statement.almanacUpsert, 'run');
    });
    it('success, empty almanac', function () {
      const cleaned = 10n;
      db.statement.almanacGet.get.returns();
      db.statement.scopeCleanup.run.returns({ changes: cleaned });
      db.statement.almanacUpsert.run.returns({ changes: 1 });
      const result = db.scopeCleanup(dbCtx, atLeastMsSinceLast);
      assert.strictEqual(result, cleaned);
    });
    it('success, too soon', function () {
      db.statement.almanacGet.get.returns({ epoch: BigInt(Math.ceil(Date.now() / 1000) - 4) });
      const result = db.scopeCleanup(dbCtx, atLeastMsSinceLast);
      assert.strictEqual(result, undefined);
      assert(db.statement.scopeCleanup.run.notCalled);
    });
    it('failure', function () {
      db.statement.almanacGet.get.returns({ epoch: 0n });
      db.statement.scopeCleanup.run.returns({ changes: 1 });
      db.statement.almanacUpsert.run.returns({ changes: 0 });
      assert.throws(() => db.scopeCleanup(dbCtx, atLeastMsSinceLast), DBErrors.UnexpectedResult);
    });
  }); // scopeCleanup

  describe('scopeDelete', function () {
    let dbGetResult, dbRunResult, scope;
    beforeEach(function () {
      sinon.stub(db.statement.scopeInUse, 'get');
      dbGetResult = {
        inUse: false,
      };
      sinon.stub(db.statement.scopeDelete, 'run');
      dbRunResult = {
        changes: 1,
      };
      scope = 'some_scope';
    });
    it('success', function () {
      db.statement.scopeInUse.get.returns(dbGetResult);
      db.statement.scopeDelete.run.returns(dbRunResult);
      const result = db.scopeDelete(dbCtx, scope);
      assert.strictEqual(result, true);
    });
    it('in use', function () {
      dbGetResult.inUse = true;
      db.statement.scopeInUse.get.returns(dbGetResult);
      db.statement.scopeDelete.run.returns(dbRunResult);
      const result = db.scopeDelete(dbCtx, scope);
      assert.strictEqual(result, false);
    });
    it('no scope', function () {
      dbRunResult.changes = 0;
      db.statement.scopeInUse.get.returns(dbGetResult);
      db.statement.scopeDelete.run.returns(dbRunResult);
      const result = db.scopeDelete(dbCtx, scope);
      assert.strictEqual(result, true);
    });
    it('failure', function () {
      db.statement.scopeInUse.get.throws(expectedException);
      assert.throws(() => db.scopeDelete(dbCtx, scope), expectedException);
    });
  }); // scopeDelete

  describe('scopeUpsert', function () {
    let dbResult, scope, application, description;
    beforeEach(function () {
      scope = 'scope';
      application = undefined;
      description = 'description';
      sinon.stub(db.statement.scopeUpsert, 'run');
      dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
    });
    it('success', function() {
      db.statement.scopeUpsert.run.returns(dbResult);
      db.scopeUpsert(dbCtx, scope, application, description);
    });
    it('failure', function () {
      dbResult.changes = 0;
      db.statement.scopeUpsert.run.returns(dbResult);
      assert.throws(() => db.scopeUpsert(dbCtx, scope, application, description), DBErrors.UnexpectedResult);
    });
    it('failure, error', function () {
      db.statement.scopeUpsert.run.throws(expectedException);
      assert.throws(() => db.scopeUpsert(dbCtx, scope, application, description), expectedException);
    });
  }); // scopeUpsert

  describe('tokenCleanup', function () {
    let codeLifespanSeconds, atLeastMsSinceLast;
    beforeEach(function () {
      codeLifespanSeconds = 600;
      atLeastMsSinceLast = 86400000;
      sinon.stub(db.statement.tokenCleanup, 'run');
      sinon.stub(db.statement.almanacGet, 'get');
      sinon.stub(db.statement.almanacUpsert, 'run');
    });
    it('success, empty almanac', function() {
      const cleaned = 10n;
      db.statement.almanacGet.get.returns();
      db.statement.tokenCleanup.run.returns({ changes: cleaned });
      db.statement.almanacUpsert.run.returns({ changes: 1 });
      const result = db.tokenCleanup(dbCtx, codeLifespanSeconds, atLeastMsSinceLast);
      assert.strictEqual(result, cleaned);
    });
    it('success, too soon', function () {
      db.statement.almanacGet.get.returns({ epoch: BigInt(Math.ceil(Date.now() / 1000) - 4) });
      const result = db.tokenCleanup(dbCtx, codeLifespanSeconds, atLeastMsSinceLast);
      assert.strictEqual(result, undefined);
      assert(db.statement.tokenCleanup.run.notCalled);
    });
    it('failure', function () {
      db.statement.almanacGet.get.returns({ epoch: 0n });
      db.statement.tokenCleanup.run.returns({ changes: 10 });
      db.statement.almanacUpsert.run.returns({ changes: 0 });
      assert.throws(() => db.tokenCleanup(dbCtx, codeLifespanSeconds, atLeastMsSinceLast), DBErrors.UnexpectedResult);
    });
  }); // tokenCleanup

  describe('tokenGetByCodeId', function () {
    let codeId, token;
    beforeEach(function () {
      codeId = '184a26f6-2612-11ec-9e88-0025905f714a';
      token = 'TokenTokenTokenToken';
      sinon.stub(db.statement.tokenGetByCodeId, 'get');
      sinon.stub(db.statement.tokenScopesGetByCodeId, 'all');
    });
    it('success', function() {
      const now = new Date();
      const nowEpoch = Math.ceil(now / 1000);
      const expected = {
        created: new Date(nowEpoch * 1000), 
        expires: null,
        refreshExpires: null,
        refreshed: null,
        isRevoked: false,
        isToken: false,
        token,
        codeId,
        scopes: [],
        profileData: {
          name: 'Some Name',
        },
      };
      const dbResult = {
        created: Math.ceil(nowEpoch),
        expires: null,
        refreshExpires: null,
        refreshed: null,
        isToken: 0,
        token,
        codeId,
        profileData: '{"name":"Some Name"}',
      };
      db.statement.tokenGetByCodeId.get.returns(dbResult);
      const result = db.tokenGetByCodeId(dbCtx, codeId);
      assert.deepStrictEqual(result, expected);
    });
    it('success without profile data', function () {
      const now = new Date();
      const nowEpoch = Math.ceil(now / 1000);
      const expected = {
        created: new Date(nowEpoch * 1000), 
        expires: null,
        refreshExpires: null,
        refreshed: null,
        isRevoked: false,
        isToken: false,
        token,
        codeId,
        scopes: ['foop', 'baa'],
      };
      const dbResult = {
        created: Math.ceil(nowEpoch),
        expires: null,
        refreshExpires: null,
        refreshed: null,
        isToken: 0,
        token,
        codeId,
      };
      db.statement.tokenGetByCodeId.get.returns(dbResult);
      db.statement.tokenScopesGetByCodeId.all.returns([{ scope: 'foop' }, { scope: 'baa' }]);
      const result = db.tokenGetByCodeId(dbCtx, codeId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', function () {
      db.statement.tokenGetByCodeId.get.throws(expectedException);
      assert.throws(() => db.tokenGetByCodeId(dbCtx, codeId), expectedException);
    });

    describe('_tokenToNative', function () {
      it('covers', function () {
        const result = DB._tokenToNative();
        assert.strictEqual(result, undefined);
      });
    }); // _tokenToNative
  }); // tokenGetByCodeId

  describe('tokenRevokeByCodeId', function () {
    let dbResult, codeId;
    beforeEach(function () {
      codeId = '2f226616-3e79-11ec-ad0f-0025905f714a';
      sinon.stub(db.statement.tokenRevokeByCodeId, 'run');
      dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
    });
    it('success', function() {
      db.statement.tokenRevokeByCodeId.run.returns(dbResult);
      db.tokenRevokeByCodeId(dbCtx, codeId);
    });
    it('failure', function () {
      dbResult.changes = 0;
      db.statement.tokenRevokeByCodeId.run.returns(dbResult);
      assert.throws(() => db.tokenRevokeByCodeId(dbCtx, codeId), DBErrors.UnexpectedResult);
    });
    it('failure, error', function () {
      db.statement.tokenRevokeByCodeId.run.throws(expectedException);
      assert.throws(() => db.tokenRevokeByCodeId(dbCtx, codeId), expectedException);
    });
  }); // tokenRevokeByCodeId

  describe('tokenRefreshRevokeByCodeId', function () {
    let dbResult, codeId;
    beforeEach(function () {
      dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      codeId = 'eabba58e-2633-11ed-bbad-0025905f714a';
      sinon.stub(db.statement.tokenRefreshRevokeByCodeId, 'run');
    });
    it('success', function () {
      db.statement.tokenRefreshRevokeByCodeId.run.returns(dbResult);
      db.tokenRefreshRevokeByCodeId(dbCtx, codeId);
    });
    it('failure', function () {
      dbResult.changes = 0;
      db.statement.tokenRefreshRevokeByCodeId.run.returns(dbResult);
      assert.throws(() => db.tokenRefreshRevokeByCodeId(dbCtx, codeId), DBErrors.UnexpectedResult);
    });
    it('failure, error', function () {
      const expected = new Error('oh no');
      db.statement.tokenRefreshRevokeByCodeId.run.throws(expected);
      assert.throws(() => db.tokenRefreshRevokeByCodeId(dbCtx, codeId), expected);
    });
  }); // tokenRefreshRevokeByCodeId

  describe('tokensGetByIdentifier', function () {
    let identifier;
    beforeEach(function  () {
      identifier = 'identifier';
      sinon.stub(db.statement.tokensGetByIdentifier, 'all');
    });
    it('success', function () {
      const nowEpoch = Math.ceil(Date.now() / 1000);
      const dbResult = [
        {
          created: nowEpoch,
          expires: nowEpoch + 86400,
          duration: 86400,
          refreshed: nowEpoch + 600,
          refreshExpires: nowEpoch + 172800,
          isRevoked: false,
          isToken: true,
          codeId: 'c0a7cef4-2637-11ed-a830-0025905f714a',
          profile: 'https://profile.example.com/',
          profileData: '{"name":"Some Name"}',
          identifier: 'username',
        },
      ];
      const expected = [
        Object.assign({}, dbResult[0], {
          created: new Date(dbResult[0].created * 1000),
          expires: new Date(dbResult[0].expires * 1000),
          refreshed: new Date(dbResult[0].refreshed * 1000),
          refreshExpires: new Date(dbResult[0].refreshExpires * 1000),
          profileData: {
            name: 'Some Name',
          },
        }),
      ];
      db.statement.tokensGetByIdentifier.all.returns(dbResult);
      const result = db.tokensGetByIdentifier(dbCtx, identifier);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', function() {
      db.statement.tokensGetByIdentifier.all.throws(expectedException);
      assert.throws(() => db.tokensGetByIdentifier(dbCtx, identifier), expectedException);
    });
  }); // tokensGetByIdentifier

  describe('ticketRedeemed', function () {
    let redeemedData, dbResult;
    beforeEach(function () {
      redeemedData = {
        resource: 'https://resource.example.com/',
        subject: 'https://subject.example.com/',
        iss: 'https://idp.example.com/',
        ticket: 'xxxTICKETxxx',
        token: 'xxxTOKENxxx',
      };
      sinon.stub(db.statement.ticketRedeemed, 'run');
      dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
    });
    it('success', function () {
      db.statement.ticketRedeemed.run.returns(dbResult);
      db.ticketRedeemed(dbCtx, redeemedData);
    });
    it('failure', function () {
      dbResult.changes = 0;
      db.statement.ticketRedeemed.run.returns(dbResult);
      assert.throws(() => db.ticketRedeemed(dbCtx, redeemedData), DBErrors.UnexpectedResult);
    });
  }); // ticketRedeemed

  describe('ticketTokenPublished', function () {
    let redeemedData, dbResult;
    beforeEach(function () {
      redeemedData = {
        resource: 'https://resource.example.com/',
        subject: 'https://subject.example.com/',
        iss: 'https://idp.example.com/',
        ticket: 'xxxTICKETxxx',
        token: 'xxxTOKENxxx',
      };
      sinon.stub(db.statement.ticketTokenPublished, 'run');
      sinon.stub(db.statement.almanacUpsert, 'run');
      dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
    });
    it('success', function () {
      db.statement.ticketTokenPublished.run.returns(dbResult);
      db.statement.almanacUpsert.run.returns(dbResult);
      db.ticketTokenPublished(dbCtx, redeemedData);
      assert(db.statement.ticketTokenPublished.run.called);
      assert(db.statement.almanacUpsert.run.called);
    });
    it('failure', function () {
      dbResult.changes = 0;
      db.statement.ticketTokenPublished.run.returns(dbResult);
      assert.throws(() => db.ticketTokenPublished(dbCtx, redeemedData), DBErrors.UnexpectedResult);
    });
    it('failure of almanac', function () {
      const dbResultAlmanac = {
        ...dbResult,
        changes: 0,
      };
      db.statement.ticketTokenPublished.run.returns(dbResult);
      db.statement.almanacUpsert.run.returns(dbResultAlmanac);
      assert.throws(() => db.ticketTokenPublished(dbCtx, redeemedData), DBErrors.UnexpectedResult);
    });
  }); // ticketTokenPublished

  describe('ticketTokenGetUnpublished', function () {
    beforeEach(function () {
      sinon.stub(db.statement.ticketTokenGetUnpublished, 'all');
    });
    it('success', function () {
      db.statement.ticketTokenGetUnpublished.all.returns([]);
      const result = db.ticketTokenGetUnpublished();
      assert.deepStrictEqual(result, []);
    });
    it('failure', function () {
      db.statement.ticketTokenGetUnpublished.all.throws(expectedException);
      assert.throws(() => db.ticketTokenGetUnpublished(), expectedException);
    });
  }); // ticketTokenGetUnpublished

  describe('_redeemedTicketToNative', function () {
    let redeemedData;
    beforeEach(function () {
      redeemedData = {
        resource: 'https://resource.example.com/',
        subject: 'https://subject.example.com/',
        iss: 'https://idp.example.com/',
        ticket: 'xxxTICKETxxx',
        token: 'xxxTOKENxxx',
        created: 1701970607n,
        published: 1701970670n,
      };
    });
    it('covers', function () {
      const expected = {
        ...redeemedData,
        created: new Date('2023-12-07T17:36:47.000Z'),
        published: new Date('2023-12-07T17:37:50.000Z'),
      };
      const result = DB._redeemedTicketToNative(redeemedData);
      assert.deepStrictEqual(result, expected);
    });
    it('covers no published', function () {
      redeemedData.published = null;
      const expected = {
        ...redeemedData,
        created: new Date('2023-12-07T17:36:47.000Z'),
        published: null,
      };
      const result = DB._redeemedTicketToNative(redeemedData);
      assert.deepStrictEqual(result, expected);
    });
  }); // _redeemedTicketToNative

}); // DatabaseSQLite
