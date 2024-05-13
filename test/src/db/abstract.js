/* eslint-disable sonarjs/no-duplicate-string */
'use strict';

const assert = require('assert');
const sinon = require('sinon');

const StubDatabase = require('../../stub-db');
const StubLogger = require('../../stub-logger');
const DB = require('../../../src/db/abstract');
const DBErrors = require('../../../src/db/errors');

describe('DatabaseBase', function () {
  let db, logger, stubDb;
  before(function () {
    logger = new StubLogger();
    logger._reset();
    stubDb = new StubDatabase();
  });
  beforeEach(function () {
    db = new DB(logger, {});
  });
  afterEach(function () {
    sinon.restore();
  });
  
  it('covers no options', function () {
    db = new DB();
  });

  describe('Interface', function () {
    it('covers abstract methods', async function () {
      await Promise.all(stubDb._implementation.map(async (m) => {
        try {
          // eslint-disable-next-line security/detect-object-injection
          await db[m]();
          assert.fail(`${m}: did not catch NotImplemented exception`);
        } catch (e) {
          assert(e instanceof DBErrors.NotImplemented, `${m}: unexpected exception ${e.name}`);
        }
      }));
    }); // covers abstract methods
    it('covers private abstract methods', async function () {
      [
        '_currentSchema',
      ].forEach((m) => {
        try {
          // eslint-disable-next-line security/detect-object-injection
          db[m]();
        } catch (e) {
          assert(e instanceof DBErrors.NotImplemented, `${m}: unexpected exception ${e.name}`);
        }
      });
    });
  }); // Interface

  describe('_ensureTypes', function () {
    let object;
    beforeEach(function () {
      object = {
        array: ['foo', 'bar'],
        bignum: BigInt(456),
        buf: Buffer.from('foop'),
        date: new Date(),
        infP: Infinity,
        infN: -Infinity,
        num: 123,
        obj: {},
        str: 'some words',
        uuid: 'a4dd5106-2d64-11ed-a2ba-0025905f714a',
        veryNull: null,
      };
    });
    it('succeeds', function () {
      db._ensureTypes(object, ['array'], ['array']);
      db._ensureTypes(object, ['bignum'], ['bigint']);
      db._ensureTypes(object, ['bignum', 'num'], ['number']);
      db._ensureTypes(object, ['buf'], ['buffer']);
      db._ensureTypes(object, ['date'], ['date']);
      db._ensureTypes(object, ['infP', 'infN'], ['infinites']);
      db._ensureTypes(object, ['str', 'veryNull'], ['string', 'null']);
    });
    it('data failure', function () {
      assert.throws(() => db._ensureTypes(object, ['missingField'], ['string', 'null']), DBErrors.DataValidation);
    });
    it('failure covers singular', function () {
      try {
        db._ensureTypes(object, ['missingField'], ['string']);
        assert.fail('validation should have failed');
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
    });
    it('parameter failure', function () {
      try {
        db._ensureTypes(object, ['missingField'], undefined);
        assert.fail('validation should have failed');
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
    });
    it('covers unknown type', function () {
      assert.throws(() => db._ensureTypes(object, ['field'], ['not a type']));
    });
  }); // _ensureTypes

  describe('_validateAuthentication', function () {
    let authentication;
    beforeEach(function () {
      authentication = {
        identifier: 'username',
        credential: '$plain$secret',
        created: new Date(),
        lastAuthentication: -Infinity,
      };
    });
    it('covers', function () {
      db._validateAuthentication(authentication);
    });
    it('covers failure', function () {
      assert.throws(() => db._validateAuthentication(undefined), DBErrors.DataValidation);
    });
  }); // _validateAuthentication

  describe('_validateResource', function () {
    let resource;
    beforeEach(function () {
      resource = {
        resourceId: '42016c1e-2d66-11ed-9e10-0025905f714a',
        secret: 'secretSecret',
        description: 'Some other service',
        created: new Date(),
      };
    });
    it('covers', function () {
      db._validateResource(resource);
    });
    it('covers failure', function () {
      assert.throws(() => db._validateResource(undefined), DBErrors.DataValidation);
    });
  }); // _validateResource

  describe('_validateToken', function () {
    let token;
    beforeEach(function () {
      token = {
        codeId: '9efc7882-2d66-11ed-b03c-0025905f714a',
        profile: 'https://profile.example.com/',
        resource: null,
        clientId: 'https://app.example.com/',
        created: new Date(),
        expires: new Date(),
        refreshExpires: null,
        refreshed: null,
        isToken: true,
        isRevoked: false,
        scopes: ['scope'],
        profileData: {
          name: 'User von Namey',
        },
      };
    });
    it('covers', function () {
      db._validateToken(token);
    });
    it('covers failure', function () {
      assert.throws(() => db._validateToken(undefined), DBErrors.DataValidation);
    });
  }); // _validateToken

  describe('_profilesScopesBuilder', function () {
    it('covers empty', function () {
      const result = DB._profilesScopesBuilder();
      assert.deepStrictEqual(result, {
        profileScopes: {},
        scopeIndex: {},
        profiles: [],
      });
    });
    it('builds expected structure', function () {
      const profileScopesRows = [
        { profile: 'https://scopeless.example.com/', scope: null, description: null, application: null, isPermanent: null, isManuallyAdded: null },
        { profile: 'https://profile.example.com/', scope: 'role:private', description: 'level', application: '', isPermanent: false, isManuallyAdded: true },
        { profile: null, scope: 'profile', description: 'profile', application: 'IndieAuth', isPermanent: true, isManuallyAdded: false },
        { profile: null, scope: 'role:private', description: 'level', application: '', isPermanent: false, isManuallyAdded: true },
        { profile: null, scope: 'read', description: 'read', application: 'MicroPub', isPermanent: true, isManuallyAdded: false },
        { profile: 'https://profile.example.com/', scope: 'profile', description: 'profile', application: 'IndieAuth', isPermanent: true, isManuallyAdded: false },
        { profile: 'https://another.example.com/', scope: 'profile', description: 'profile', application: 'IndieAuth', isPermanent: true, isManuallyAdded: false },
      ];
      const expected = {
        profileScopes: {
          'https://scopeless.example.com/': {},
          'https://profile.example.com/': {},
          'https://another.example.com/': {},
        },
        scopeIndex: {
          'role:private': {
            description: 'level',
            application: '',
            isPermanent: false,
            isManuallyAdded: true,
            profiles: ['https://profile.example.com/'],
          },
          'profile': {
            description: 'profile',
            application: 'IndieAuth',
            isPermanent: true,
            isManuallyAdded: false,
            profiles: ['https://profile.example.com/', 'https://another.example.com/'],
          },
          'read': {
            description: 'read',
            application: 'MicroPub',
            isPermanent: true,
            isManuallyAdded: false,
            profiles: [],
          },
        },
        profiles: ['https://scopeless.example.com/', 'https://profile.example.com/', 'https://another.example.com/'],
      };
      expected.profileScopes['https://profile.example.com/']['role:private'] = expected.scopeIndex['role:private'];
      expected.profileScopes['https://profile.example.com/']['profile'] = expected.scopeIndex['profile'];
      expected.profileScopes['https://another.example.com/']['profile'] = expected.scopeIndex['profile'];

      const result = DB._profilesScopesBuilder(profileScopesRows);
      assert.deepStrictEqual(result, expected);
    });
  }); // _profilesScopesBuilder

  describe('initialize', function () {
    let currentSchema;
    beforeEach(function () {
      currentSchema = {
        major: 1,
        minor: 0,
        patch: 0,
      };
      db.schemaVersionsSupported = {
        min: { ...currentSchema },
        max: { ...currentSchema },
      };
      sinon.stub(db, '_currentSchema').resolves(currentSchema);
    });
    it('covers success', async function () {
      await db.initialize();
    });
    it('covers failure', async function() {
      db.schemaVersionsSupported = {
        min: {
          major: 3,
          minor: 2,
          patch: 1,
        },
        max: {
          major: 5,
          minor: 0,
          patch: 0,
        },
      };
      try {
        await db.initialize();
        assert.fail('did not get expected exception');
      } catch (e) {
        assert(e instanceof DBErrors.MigrationNeeded);
      }
    });
  }); // initialize

}); // DatabaseBase
