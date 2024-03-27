/* eslint-disable sonarjs/no-identical-functions */
/* eslint-env mocha */
/* eslint-disable sonarjs/no-duplicate-string */
'use strict';

/* This provides implementation coverage, stubbing pg-promise. */

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line node/no-unpublished-require
const StubLogger = require('../../stub-logger');
const StubDatabase = require('../../stub-db');
const DB = require('../../../src/db/postgres');
const DBErrors = require('../../../src/db/errors');
const common = require('../../../src/common');
const Config = require('../../../config');

const expectedException = new Error('oh no');

describe('DatabasePostgres', function () {
  let db, logger, options, pgpStub;
  let dbCtx;
  before(function () {
    pgpStub = () => {
      const stub = {
        result: () => ({ rows: [] }),
        all: common.nop,
        get: common.nop,
        run: common.nop,
        one: common.nop,
        manyOrNone: common.nop,
        oneOrNone: common.nop,
        query: common.nop,
        batch: common.nop,
        multiResult: common.nop,
        connect: common.nop,
      };
      stub.tx = (fn) => fn(stub);
      stub.txIf = (fn) => fn(stub);
      stub.task = (fn) => fn(stub);
      return stub;
    };
    pgpStub.utils = {
      enumSql: () => ({}),
    };
    pgpStub.QueryFile = class {};
    pgpStub.end = common.nop;
  });
  beforeEach(function () {
    logger = new StubLogger();
    logger._reset();
    options = new Config('test');
    db = new DB(logger, options, pgpStub);
    dbCtx = db.db;
  });
  afterEach(function () {
    sinon.restore();
  });

  it('covers no query logging', function () {
    delete options.db.queryLogLevel;
    db = new DB(logger, options, pgpStub);
  });


  // Ensure all interface methods are implemented
  describe('Implementation', function () {
    it('implements interface', async function () {
      const stubDb = new StubDatabase();
      const results = await Promise.allSettled(stubDb._implementation.map(async (fn) => {
        try {
          // eslint-disable-next-line security/detect-object-injection
          await db[fn](db.db);
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

  describe('pgpInitOptions', function () {
    describe('error', function () {
      it('covers', function () {
        const err = {};
        const event = {};
        db.pgpInitOptions.error(err, event);
        assert(db.logger.error.called);
      });
    }); // error
    describe('query', function () {
      it('covers', function () {
        const event = {};
        db.pgpInitOptions.query(event);
        assert(db.logger.debug.called);
      });
    }); // query
    describe('receive', function () {
      it('covers', function () {
        const data = [
          {
            column_one: 'one', // eslint-disable-line camelcase
            column_two: 2, // eslint-disable-line camelcase
          },
          {
            column_one: 'foo', // eslint-disable-line camelcase
            column_two: 4, // eslint-disable-line camelcase
          },
        ];
        const result = {};
        const event = {};
        const expectedData = [
          {
            columnOne: 'one',
            columnTwo: 2,
          },
          {
            columnOne: 'foo',
            columnTwo: 4,
          },
        ];
        db.pgpInitOptions.receive({ data, result, ctx: event });
        assert(db.logger.debug.called);
        assert.deepStrictEqual(data, expectedData);
      });
      it('covers no query logging', function () {
        delete options.db.queryLogLevel;
        db = new DB(logger, options, pgpStub);
        const data = [
          {
            column_one: 'one', // eslint-disable-line camelcase
            column_two: 2, // eslint-disable-line camelcase
          },
          {
            column_one: 'foo', // eslint-disable-line camelcase
            column_two: 4, // eslint-disable-line camelcase
          },
        ];
        const result = {};
        const event = {};
        const expectedData = [
          {
            columnOne: 'one',
            columnTwo: 2,
          },
          {
            columnOne: 'foo',
            columnTwo: 4,
          },
        ];
        db.pgpInitOptions.receive({ data, result, ctx: event });
        assert(db.logger.debug.called);
        assert.deepStrictEqual(data, expectedData);
      });

    }); // receive
  }); // pgpInitOptions

  describe('_initTables', function () {
    beforeEach(function () {
      sinon.stub(db.db, 'oneOrNone');
      sinon.stub(db.db, 'multiResult');
      sinon.stub(db, '_currentSchema');
    });

    it('covers apply', async function() {
      db.db.oneOrNone.onCall(0).resolves(null).onCall(1).resolves({});
      db._currentSchema.resolves({ major: 0, minor: 0, patch: 0 });
      await db._initTables();
    });
    it('covers exists', async function() {
      db.db.oneOrNone.resolves({});
      db._currentSchema.resolves(db.schemaVersionsSupported.max);
      await db._initTables();
    });
  }); // _initTables

  describe('initialize', function () {
    after(function () {
      delete db.listener;
    });
    it('passes supported version', async function () {
      const version = { major: 1, minor: 0, patch: 0 };
      sinon.stub(db.db, 'one').resolves(version);
      await db.initialize(false);
    });
    it('fails low version', async function () {
      const version = { major: 0, minor: 0, patch: 0 };
      sinon.stub(db.db, 'one').resolves(version);
      await assert.rejects(() => db.initialize(false), DBErrors.MigrationNeeded);
    });
    it('fails high version', async function () {
      const version = { major: 100, minor: 100, patch: 100 };
      sinon.stub(db.db, 'one').resolves(version);
      await assert.rejects(() => db.initialize(false));
    });
    it('covers migration', async function() {
      sinon.stub(db.db, 'oneOrNone').resolves({});
      sinon.stub(db.db, 'multiResult');
      sinon.stub(db, '_currentSchema').resolves(db.schemaVersionsSupported.max);
      sinon.stub(db.db, 'one').resolves(db.schemaVersionsSupported.max);
      await db.initialize();
    });
    it('covers listener', async function() {
      db.listener = {
        start: sinon.stub(),
      };
      const version = { major: 1, minor: 0, patch: 0 };
      sinon.stub(db.db, 'one').resolves(version);
      await db.initialize(false);
      assert(db.listener.start.called);
    });
  }); // initialize

  describe('healthCheck', function () {
    beforeEach(function () {
      sinon.stub(db.db, 'connect').resolves({
        done: () => {},
        client: {
          serverVersion: '0.0',
        },
      });
    });
    it('covers', async function () {
      const result = await db.healthCheck();
      assert.deepStrictEqual(result, { serverVersion: '0.0' });
    });
  }); // healthCheck

  describe('_queryFileHelper', function () {
    it('covers success', function () {
      const _queryFile = db._queryFileHelper(pgpStub);
      _queryFile();
    });
    it('covers failure', function () {
      pgpStub.QueryFile = class {
        constructor() {
          this.error = expectedException;
        }
      };
      const _queryFile = db._queryFileHelper(pgpStub);
      assert.throws(() => _queryFile(), expectedException);
    });
  }); // _queryFileHelper

  describe('_closeConnection', function () {
    after(function () {
      delete db.listener;
    });
    it('success', async function () {
      sinon.stub(db._pgp, 'end');
      await db._closeConnection();
      assert(db._pgp.end.called);
    });
    it('failure', async function () {
      sinon.stub(db._pgp, 'end').throws(expectedException);
      await assert.rejects(() => db._closeConnection(), expectedException);
    });
    it('covers listener', async function () {
      db.listener = {
        stop: sinon.stub(),
      };
      sinon.stub(db._pgp, 'end');
      await db._closeConnection();
      assert(db._pgp.end.called);
    });
  }); // _closeConnection

  describe('_purgeTables', function () {
    it('covers not really', async function () {
      sinon.stub(db.db, 'tx');
      await db._purgeTables(false);
      assert(!db.db.tx.called);
    });
    it('success', async function () {
      sinon.stub(db.db, 'batch');
      await db._purgeTables(true);
      assert(db.db.batch.called);
    });
    it('failure', async function () {
      sinon.stub(db.db, 'tx').rejects(expectedException)
      await assert.rejects(() => db._purgeTables(true), expectedException);
    });
  }); // _purgeTables

  describe('context', function () {
    it('covers', async function () {
      await db.context(common.nop);
    });
  }); // context

  describe('transaction', function () {
    it('covers', async function () {
      await db.transaction(db.db, common.nop);
    });
  }); // transaction

  describe('almanacGetAll', function () {
    beforeEach(function () {
      sinon.stub(db.db, 'manyOrNone');
    });
    it('success', async function () {
      const expected = [{ event: 'someEvent', date: new Date() }];
      db.db.manyOrNone.resolves(expected);
      const result = await db.almanacGetAll(dbCtx);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      db.db.manyOrNone.rejects(expectedException);
      await assert.rejects(() => db.almanacGetAll(dbCtx), expectedException);
    });
  }); // almanacGetAll

  describe('almanacUpsert', function () {
    let event, date;
    beforeEach(function () {
      event = 'test_event';
      date = new Date('Fri Dec 22 03:27 UTC 2023')
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.almanacUpsert(dbCtx, event, date);
    });
    it('success with default date', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.almanacUpsert(dbCtx, event);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await assert.rejects(() => db.almanacUpsert(dbCtx, event, date), DBErrors.UnexpectedResult);
    });
  }); // almanacUpsert

  describe('authenticationSuccess', function () {
    let identifier;
    beforeEach(function () {
      identifier = 'username';
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.authenticationSuccess(dbCtx, identifier);
    });
    it('failure', async function() {
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await assert.rejects(() => db.authenticationSuccess(dbCtx, identifier), DBErrors.UnexpectedResult);
    });
  }); // authenticationSuccess

  describe('authenticationGet', function () {
    let identifier, credential;
    beforeEach(function () {
      identifier = 'username';
      credential = '$z$foo';
    });
    it('success', async function () {
      const dbResult = { identifier, credential };
      sinon.stub(db.db, 'oneOrNone').resolves(dbResult);
      const result = await db.authenticationGet(dbCtx, identifier);
      assert.deepStrictEqual(result, dbResult);
    });
    it('failure', async function() {
      sinon.stub(db.db, 'oneOrNone').rejects(expectedException);
      await assert.rejects(() => db.authenticationGet(dbCtx, identifier, credential), expectedException);
    });
  }); // authenticationGet

  describe('authenticationUpsert', function () {
    let identifier, credential;
    beforeEach(function () {
      identifier = 'username';
      credential = '$z$foo';
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.authenticationUpsert(dbCtx, identifier, credential);
    });
    it('failure', async function() {
      credential = undefined;
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await assert.rejects(() => db.authenticationUpsert(dbCtx, identifier, credential), DBErrors.UnexpectedResult);
    });
  }); // authenticationUpsert

  describe('authenticationUpdateCredential', function () {
    let identifier, credential;
    beforeEach(function () {
      identifier = 'username';
      credential = '$z$foo';
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.authenticationUpdateCredential(dbCtx, identifier, credential);
    });
    it('failure', async function () {
      credential = undefined;
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await assert.rejects(() => db.authenticationUpdateCredential(dbCtx, identifier, credential), DBErrors.UnexpectedResult);

    });
  }); // authenticationUpdateCredential

  describe('authenticationUpdateOTPKey', function () {
    let identifier, otpKey;
    beforeEach(function () {
      identifier = 'username';
      otpKey = '1234567890123456789012';
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.authenticationUpdateOTPKey(dbCtx, identifier, otpKey);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await assert.rejects(() => db.authenticationUpdateOTPKey(dbCtx, identifier, otpKey), DBErrors.UnexpectedResult);
    });
  }); // authenticationUpdateOTPKey

  describe('profileIdentifierInsert', function () {
    let profile, identifier;
    beforeEach(function () {
      profile = 'https://profile.example.com/';
      identifier = 'username';
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.profileIdentifierInsert(dbCtx, profile, identifier);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await assert.rejects(() => db.profileIdentifierInsert(dbCtx, profile, identifier), DBErrors.UnexpectedResult);
    });
  }); // profileIdentifierInsert

  describe('profileIsValid', function () {
    let profile;
    beforeEach(function () {
      profile = 'https://profile.exmaple.com';
    });
    it('valid profile', async function () {
      sinon.stub(db.db, 'oneOrNone').resolves({ profile });
      const result = await db.profileIsValid(dbCtx, profile);
      assert.strictEqual(result, true);
    });
    it('invalid profile', async function () {
      sinon.stub(db.db, 'oneOrNone').resolves();
      const result = await db.profileIsValid(dbCtx, profile);
      assert.strictEqual(result, false);
    });
    it('failure', async function () {
      sinon.stub(db.db, 'oneOrNone').rejects(expectedException);
      await assert.rejects(() => db.profileIsValid(dbCtx, profile), expectedException);
    });
  }); // profileIsValid

  describe('tokenGetByCodeId', function () {
    let codeId;
    beforeEach(function () {
      sinon.stub(db.db, 'oneOrNone');
      codeId = 'xxxxxxxx';
    });
    it('success', async function() {
      const dbResult = {
        token: '',
        codeId,
        created: new Date(),
        expires: new Date(Date.now() +  24 * 60 * 60 * 1000),
      };
      db.db.oneOrNone.resolves(dbResult);
      const result = await db.tokenGetByCodeId(dbCtx, codeId);
      assert.deepStrictEqual(result, dbResult);
    });
    it('failure', async function () {
      db.db.oneOrNone.rejects(expectedException);
      await assert.rejects(() => db.tokenGetByCodeId(dbCtx, codeId), expectedException);
    });
  }); // tokenGetByCodeId

  describe('profileScopeInsert', function () {
    let profile, scope;
    beforeEach(function () {
      profile = 'https://profile.example.com/';
      scope = 'scope';
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.profileScopeInsert(dbCtx, profile, scope);
    });
    it('failure', async function () {
      sinon.stub(db.db, 'result').rejects(expectedException);
      await assert.rejects(() => db.profileScopeInsert(dbCtx, profile, scope), expectedException);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 2,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await assert.rejects(() => db.profileScopeInsert(dbCtx, profile, scope), DBErrors.UnexpectedResult);
    });
  }); // profileScopeInsert

  describe('profileScopesSetAll', function () {
    let profile, scopes;
    beforeEach(function () {
      profile = 'https://example.com/';
      scopes = [];
      sinon.stub(db.db, 'result');
    });
    it('success, no scopes', async function () {
      db.db.result.resolves();
      await db.profileScopesSetAll(dbCtx, profile, scopes);
    });
    it('success, scopes', async function () {
      db.db.result.resolves();
      scopes.push('profile', 'email', 'create');
      await db.profileScopesSetAll(dbCtx, profile, scopes);
    });
    it('failure', async function () {
      db.db.result.rejects(expectedException);
      await assert.rejects(() => db.profileScopesSetAll(dbCtx, profile, scopes), expectedException);
    });
  }); // profileScopesSetAll

  describe('profilesScopesByIdentifier', function () {
    let identifier, scopeIndex, profileScopes, profiles;
    beforeEach(function () {
      identifier = 'identifier';
      scopeIndex = {
        'scope': {
          description: 'A scope.',
          application: 'test',
          isPermanent: false,
          isManuallyAdded: true,
          profiles: ['https://first.example.com/', 'https://second.example.com/'],
        },
        'another_scope': {
          description: 'Another scope.',
          application: 'another test',
          isPermanent: true,
          isManuallyAdded: false,
          profiles: ['https://first.example.com/'],
        },
        'no_app_scope': {
          description: 'A scope without application.',
          application: '',
          isPermanent: false,
          isManuallyAdded: false,
          profiles: ['https://second.example.com/'],
        },
        'no_profile_scope': {
          description: 'A scope without profiles.',
          application: 'test',
          isPermanent: false,
          isManuallyAdded: false,
          profiles: [],
        },
      };
      profileScopes = {
        'https://first.example.com/': {
          'scope': scopeIndex['scope'],
          'another_scope': scopeIndex['another_scope'],
        },
        'https://second.example.com/': {
          'scope': scopeIndex['scope'],
          'no_app_scope': scopeIndex['no_app_scope'],
        },
        'https://scopeless.example.com/': {},
      };
      profiles = [
        'https://first.example.com/',
        'https://second.example.com/',
        'https://scopeless.example.com/',
      ];
    });
    it('success', async function () {
      const dbResult = [
        { profile: 'https://first.example.com/', scope: 'scope', application: 'test', description: 'A scope.', isPermanent: false, isManuallyAdded: true },
        { profile: 'https://first.example.com/', scope: 'another_scope', application: 'another test', description: 'Another scope.', isPermanent: true, isManuallyAdded: false },
        { profile: 'https://second.example.com/', scope: 'no_app_scope', application: '', description: 'A scope without application.', isPermanent: false, isManuallyAdded: false },
        { profile: 'https://second.example.com/', scope: 'scope', application: 'test', description: 'A scope.', isPermanent: false, isManuallyAdded: true },
        { profile: null, scope: 'no_profile_scope', application: 'test', description: 'A scope without profiles.', isPermanent: false, isManuallyAdded: false },
        { profile: 'https://scopeless.example.com/', scope: null, application: null, description: null, isPermanent: null, isManuallyAdded: null },
      ];
      const expected = {
        scopeIndex,
        profileScopes,
        profiles,
      };
      sinon.stub(db.db, 'manyOrNone').resolves(dbResult);
      const result = await db.profilesScopesByIdentifier(dbCtx, identifier);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      sinon.stub(db.db, 'manyOrNone').rejects(expectedException);
      await assert.rejects(() => db.profilesScopesByIdentifier(dbCtx, identifier), expectedException);
    });
  }); // profilesScopesByIdentifier

  describe('redeemCode', function () {
    let codeId, isToken, clientId, profile, identifier, scopes, lifespanSeconds, refreshId, profileData;
    beforeEach(function () {
      codeId = '41945b8e-3e82-11ec-82d1-0025905f714a';
      isToken = false;
      clientId = 'https://app.example.com/';
      profile = 'https://profile.example.com/';
      identifier = 'username';
      scopes = ['scope1', 'scope2'];
      lifespanSeconds = 600;
      refreshId = undefined;
      profileData = undefined;
    });
    it('success redeem', async function () {
      const dbResult = {
        rowCount: 1,
        rows: [{ isRevoked: false }],
        duration: 22,
      };
      const dbResultScopes = {
        rowCount: scopes.length,
        rows: [],
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult).onCall(2).resolves(dbResultScopes);
      const result = await db.redeemCode(dbCtx, { codeId, isToken, clientId, profile, identifier, scopes, lifespanSeconds, refreshId, profileData });
      assert.strictEqual(result, true);
    });
    it('success redeem, no scopes', async function () {
      scopes = [];
      const dbResult = {
        rowCount: 1,
        rows: [{ isRevoked: false }],
        duration: 22,
      };
      const dbResultScopes = {
        rowCount: scopes.length,
        rows: [],
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult).onCall(1).resolves(dbResultScopes);
      const result = await db.redeemCode(dbCtx, { codeId, isToken, clientId, profile, identifier, scopes, lifespanSeconds, refreshId, profileData });
      assert.strictEqual(result, true);
    });
    it('success revoke', async function () {
      const dbResult = {
        rowCount: 1,
        rows: [{ isRevoked: true }],
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      const result = await db.redeemCode(dbCtx, { codeId, isToken, clientId, profile, identifier, scopes, lifespanSeconds, refreshId, profileData });
      assert.strictEqual(result, false);
    });
    it('failure', async function() {
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await assert.rejects(() => db.redeemCode(dbCtx, { codeId, clientId, profile, identifier, scopes, lifespanSeconds, refreshId, profileData }), DBErrors.UnexpectedResult);
    });
    it('failure token scopes', async function () {
      const dbResult = {
        rowCount: 1,
        rows: [{ isRevoked: false }],
        duration: 22,
      };
      const dbResultNone = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult).onCall(2).resolves(dbResultNone);
      await assert.rejects(() => db.redeemCode(dbCtx, { codeId, clientId, profile, identifier, scopes, lifespanSeconds, refreshId, profileData }), DBErrors.UnexpectedResult);
    });
  }); // redeemCode

  describe('refreshCode', function () {
    let codeId, now, removeScopes;
    beforeEach(function () {
      codeId = '41945b8e-3e82-11ec-82d1-0025905f714a';
      now = new Date();
      removeScopes = [];
      sinon.stub(db.db, 'result').resolves({ rowCount: removeScopes.length });
      sinon.stub(db.db, 'oneOrNone');
    });
    it('success', async function () {
      db.db.oneOrNone.resolves({
        expires: now,
        refreshExpires: now,
      });
      const result = await db.refreshCode(dbCtx, codeId, now, removeScopes);
      assert(db.db.result.notCalled);
      assert(result);
      assert(result.expires);
      assert(result.refreshExpires);
      assert(!result.scopes);
    });
    it('success with scope reduction', async function () {
      removeScopes = ['create'];
      db.db.oneOrNone.resolves({
        expires: now,
        refreshExpires: now,
        scopes: [],
      });
      db.db.result.resolves({ rowCount: removeScopes.length });
      const result = await db.refreshCode(dbCtx, codeId, now, removeScopes);
      assert(result);
      assert(result.expires);
      assert(result.refreshExpires);
      assert(!result.scopes.includes('create'));
    });
    it('failure', async function () {
      db.db.oneOrNone.rejects(expectedException);
      await assert.rejects(async () => db.refreshCode(dbCtx, codeId, now, removeScopes), expectedException);
    });
    it('failure with scope reduction', async function () {
      removeScopes = ['create'];
      db.db.oneOrNone.resolves({});
      db.db.result.resolves({ rowCount: 0 });
      await assert.rejects(async () => db.refreshCode(dbCtx, codeId, now, removeScopes), DBErrors.UnexpectedResult);
    });
  }); // refreshCode

  describe('resourceGet', function () {
    let identifier;
    beforeEach(function () {
      sinon.stub(db.db, 'oneOrNone');
      identifier = '05b81112-b224-11ec-a9c6-0025905f714a';
    });
    it('success', async function () {
      const dbResult = {
        identifier,
        secret: 'secrety',
      };
      db.db.oneOrNone.resolves(dbResult);
      const result = await db.resourceGet(dbCtx, identifier);
      assert.deepStrictEqual(result, dbResult);
    });
    it('failure', async function() {
      db.db.oneOrNone.rejects(expectedException);
      await assert.rejects(() => db.resourceGet(dbCtx, identifier), expectedException);
    });
  }); // resourceGet

  describe('resourceUpsert', function () {
    let resourceId, secret, description;
    beforeEach(function () {
      resourceId = '98b8d9ec-f8e2-11ec-aceb-0025905f714a';
      secret = 'supersecret';
      description = 'some service';
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: [],
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.resourceUpsert(dbCtx, resourceId, secret, description)
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await assert.rejects(() => db.resourceUpsert(dbCtx, resourceId, undefined, description), DBErrors.UnexpectedResult);
    });
  }); // resourceUpsert

  describe('scopeCleanup', function () {
    let atLeastMsSinceLast;
    beforeEach(function () {
      sinon.stub(db.db, 'result');
      sinon.stub(db.db, 'oneOrNone');
      atLeastMsSinceLast = 86400000;
    });
    it('success, empty almanac', async function () {
      const cleaned = 10;
      db.db.result
        .onFirstCall().resolves({ rowCount: cleaned })
        .onSecondCall().resolves({ rowCount: 1 });
      const result = await db.scopeCleanup(dbCtx, atLeastMsSinceLast);
      assert.strictEqual(result, cleaned);
    });
    it('success, too soon', async function () {
      db.db.oneOrNone.resolves({ date: new Date(Date.now() - 4000) });
      const result = await db.scopeCleanup(dbCtx, atLeastMsSinceLast);
      assert.strictEqual(result, undefined);
      assert(db.db.result.notCalled);
    });
    it('failure', async function () {
      db.db.result.resolves({ rowCount: 0 });
      await assert.rejects(async () => db.scopeCleanup(dbCtx, atLeastMsSinceLast), DBErrors.UnexpectedResult);
    });
  }); // scopeCleanup

  describe('scopeDelete', function () {
    let scope;
    beforeEach(function () {
      scope = 'somescope';
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'one').resolves({ inUse: false });
      sinon.stub(db.db, 'result').resolves(dbResult);
      const result = await db.scopeDelete(dbCtx, scope);
      assert(db.db.result.called);
      assert.strictEqual(result, true);
    });
    it('success, no scope', async function () {
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'one').resolves({ inUse: false });
      sinon.stub(db.db, 'result').resolves(dbResult);
      const result = await db.scopeDelete(dbCtx, scope);
      assert(db.db.result.called);
      assert.strictEqual(result, true);
    });
    it('scope in use', async function () {
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'one').resolves({ inUse: true });
      sinon.stub(db.db, 'result').resolves(dbResult);
      const result = await db.scopeDelete(dbCtx, scope);
      assert(db.db.result.notCalled);
      assert.strictEqual(result, false);
    });
    it('failure', async function () {
      sinon.stub(db.db, 'one').rejects(expectedException);
      await assert.rejects(() => db.scopeDelete(dbCtx, scope), expectedException);
    });
  }); // scopeDelete

  describe('scopeUpsert', function () {
    let scope, description;
    beforeEach(function () {
      scope = 'username';
      description = '$z$foo';
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.scopeUpsert(dbCtx, scope, description);
    });
    it('failure', async function() {
      scope = undefined;
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await assert.rejects(() => db.scopeUpsert(dbCtx, scope, description), DBErrors.UnexpectedResult);
    });
  }); // scopeUpsert

  describe('tokenCleanup', function () {
    let codeLifespanSeconds, atLeastMsSinceLast;
    beforeEach(function () {
      sinon.stub(db.db, 'result');
      sinon.stub(db.db, 'oneOrNone');
      codeLifespanSeconds = 600000;
      atLeastMsSinceLast = 86400000;
    });
    it('success, empty almanac', async function () {
      const cleaned = 10;
      db.db.result
        .onFirstCall().resolves({ rowCount: cleaned })
        .onSecondCall().resolves({ rowCount: 1 });
      const result = await db.tokenCleanup(dbCtx, codeLifespanSeconds, atLeastMsSinceLast);
      assert.strictEqual(result, cleaned);
    });
    it('success, too soon', async function () {
      db.db.oneOrNone.resolves({ date: new Date(Date.now() - 4000) });
      const result = await db.tokenCleanup(dbCtx, codeLifespanSeconds, atLeastMsSinceLast);
      assert.strictEqual(result, undefined);
      assert(db.db.result.notCalled);
    });
    it('failure', async function () {
      db.db.result.resolves({ rowCount: 0 });
      await assert.rejects(() => db.tokenCleanup(dbCtx, codeLifespanSeconds, atLeastMsSinceLast), DBErrors.UnexpectedResult);
    });
  }); // tokenCleanup

  describe('tokenRevokeByCodeId', function () {
    let codeId;
    beforeEach(function () {
      codeId = 'a74bda94-3dae-11ec-8908-0025905f714a';
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.tokenRevokeByCodeId(dbCtx, codeId);
    });
    it('failure', async function() {
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await assert.rejects(() => db.tokenRevokeByCodeId(dbCtx, codeId), DBErrors.UnexpectedResult);
    });
  }); // tokenRevokeByCodeId

  describe('tokenRefreshRevokeByCodeId', function () {
    let codeId;
    beforeEach(function () {
      codeId = '279947c8-2584-11ed-a2d6-0025905f714a';
      sinon.stub(db.db, 'result');
    });
    it('success', async function () {
      db.db.result.resolves({ rowCount: 1 });
      await db.tokenRefreshRevokeByCodeId(dbCtx, codeId);
    });
    it('failure, no code', async function () {
      db.db.result.resolves({ rowCount: 0 });
      assert.rejects(async () => db.tokenRefreshRevokeByCodeId(dbCtx, codeId), DBErrors.UnexpectedResult);
    });
    it('failure', async function () {
      db.db.result.rejects(expectedException);
      assert.rejects(async () => db.tokenRefreshRevokeByCodeId(dbCtx, codeId), expectedException);
    });
  }); // tokenRefreshRevokeByCodeId

  describe('tokensGetByIdentifier', function () {
    let identifier;
    beforeEach(function () {
      identifier = 'identifier';
    });
    it('success', async function () {
      const dbResult = [
        {
          'created': new Date(),
          'expires': new Date(),
          'isRevoked': false,
          'token': '',
          'codeId': '',
          'profile': '',
          'identifier': '',
        },
      ];
      const expected = dbResult;
      sinon.stub(db.db, 'manyOrNone').resolves(dbResult);
      const result = await db.tokensGetByIdentifier(dbCtx, identifier);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      sinon.stub(db.db, 'manyOrNone').rejects(expectedException);
      await assert.rejects(() => db.tokensGetByIdentifier(dbCtx, identifier), expectedException);
    });
  }); // tokensGetByIdentifier

  describe('ticketRedeemed', function () {
    let redeemedData;
    beforeEach(function () {
      redeemedData = {
        resource: 'https://resource.example.com/',
        subject: 'https://subject.example.com/',
        iss: 'https://idp.example.com/',
        ticket: 'xxxTICKETxxx',
        token: 'xxxTOKENxxx',
      };
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.ticketRedeemed(dbCtx, redeemedData);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await assert.rejects(() => db.ticketRedeemed(dbCtx, redeemedData), DBErrors.UnexpectedResult);
    });
  }); // ticketRedeemed

  describe('ticketTokenPublished', function () {
    let redeemedData;
    beforeEach(function () {
      redeemedData = {
        resource: 'https://resource.example.com/',
        subject: 'https://subject.example.com/',
        iss: 'https://idp.example.com/',
        ticket: 'xxxTICKETxxx',
        token: 'xxxTOKENxxx',
      };
      sinon.stub(db.db, 'result');
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      db.db.result.resolves(dbResult);
      await db.ticketTokenPublished(dbCtx, redeemedData);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      db.db.result.resolves(dbResult);
      await assert.rejects(() => db.ticketTokenPublished(dbCtx, redeemedData), DBErrors.UnexpectedResult);
    });
    it('failure of almanac', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      const dbResultAlmanac = {
        ...dbResult,
        rowCount: 0,
      };
      db.db.result.resolves(dbResult).onCall(1).resolves(dbResultAlmanac);
      await assert.rejects(() => db.ticketTokenPublished(dbCtx, redeemedData), DBErrors.UnexpectedResult);
    });
  }); // ticketTokenPublished

  describe('ticketTokenGetUnpublished', function () {
    it('success', async function () {
      const expected = [{
        resource: 'https://resource.example.com/',
        subject: 'https://subject.example.com/',
        iss: 'https://idp.example.com/',
        ticket: 'xxxTICKETxxx',
        token: 'xxxTOKENxxx',
        created: new Date(),
        published: null,
      }];
      sinon.stub(db.db, 'manyOrNone').resolves(expected);
      const result = await db.ticketTokenGetUnpublished(dbCtx);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      sinon.stub(db.db, 'manyOrNone').rejects(expectedException);
      await assert.rejects(() => db.ticketTokenGetUnpublished(dbCtx), expectedException);
    });
  }); // ticketTokenGetUnpublished

}); // DatabasePostgres
