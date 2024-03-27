/* eslint-env mocha */
/* eslint-disable sonarjs/no-identical-functions */
'use strict';

/**
 * These are LIVE FIRE tests to exercise actual database operations.
 * They should be configured to use local test databases, as they
 * perform DESTRUCTIVE ACTIONS on all tables, beginning with a COMPLETE
 * DATA WIPE.
 * 
 * They will only run if all the appropriate environmental settings exist:
 * - INTEGRATION_TESTS must be set
 * - <ENGINE>_TEST_PATH must point to the endpoint/db
 * 
 * These tests are sequential, relying on the state created along the way.
 * 
 */

const assert = require('assert');
const { step } = require('mocha-steps'); // eslint-disable-line node/no-unpublished-require
const StubLogger = require('../../stub-logger');
// const DBErrors = require('../../../src/db/errors');
// const testData = require('../../test-data/db-integration');

describe('Database Integration', function () {
  const implementations = [];

  if (!process.env.INTEGRATION_TESTS) {
    it.skip('integration tests not requested');
    return;
  }

  if (process.env.POSTGRES_TEST_PATH) {
    implementations.push({
      name: 'PostgreSQL',
      module: '../../../src/db/postgres',
      config: {
        db: {
          connectionString: `postgresql://${process.env.POSTGRES_TEST_PATH}`,
          queryLogLevel: 'debug',
          noWarnings: true,
        },
      },
    });
  }

  if (process.env.SQLITE_TEST_PATH) {
    implementations.push({
      name: 'SQLite',
      module: '../../../src/db/sqlite',
      config: {
        db: {
          connectionString: `sqlite://${process.env.SQLITE_TEST_PATH}`,
          queryLogLevel: 'debug',
          sqliteOptimizeAfterChanges: 10,
        },
      },
    });
  }

  if (!implementations.length) {
    it('have some implementations to test', function () {
      assert.fail('No implementations have been configured for requested integration tests');
    });
  }

  implementations.forEach(function (i) {
    describe(i.name, function () {
      let logger;
      let DB, db;
      let profile, identifier;

      before(async function () {
        this.timeout(10 * 1000); // Allow some time for creating tables et cetera.
        logger = new StubLogger();
        logger._reset();
        // eslint-disable-next-line security/detect-non-literal-require
        DB = require(i.module);
        db = new DB(logger, i.config);
        await db.initialize();
        await db._purgeTables(true);
      });
      after(async function () {
        await db._closeConnection();
      });

      beforeEach(function () {
        identifier = 'username';
        profile = 'https://example.com/profile';
      });

      describe('Healthcheck', function () {
        it('should succeed', async function () {
          const result = await db.healthCheck();
          assert(result);
        });
      });

      describe('Resources', function () {
        let resourceId, secret, description;
        before(function () {
          secret = 'shared secret';
          description = 'A resource server that needs to verify our tokens.';
        });
        step('returns nothing when resource does not exist', async function () {
          await db.context(async (dbCtx) => {
            const badResourceId = 'f1669969-c87e-46f8-83bb-a6712981d15d';
            const result = await db.resourceGet(dbCtx, badResourceId);
            assert(!result);
          });
        });
        step('creates resource', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.resourceUpsert(dbCtx, undefined, secret, description);
            assert(result.resourceId);
            resourceId = result.resourceId;
          });
        });
        step('gets resource', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.resourceGet(dbCtx, resourceId);
            assert.strictEqual(result.secret, secret);
            db._validateResource(result);
          });
        });
        step('updates resource', async function () {
          await db.context(async (dbCtx) => {
            secret = 'new shared secret';
            description = 'Still a resource server, but with a new description.';
            await db.resourceUpsert(dbCtx, resourceId, secret, description);
            const result = await db.resourceGet(dbCtx, resourceId);
            assert.strictEqual(result.resourceId, resourceId);
            assert.strictEqual(result.secret, secret);
            assert.strictEqual(result.description, description);
          });
        });
      }); // Resources

      describe('Users and Profiles and Scopes', function () {
        let credential, otpKey;
        beforeEach(function () {
          credential = '$plain$myPassword';
          otpKey = '1234567890123456789012';
        });
        step('returns nothing when auth does not exist', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.authenticationGet(dbCtx, identifier);
            assert(!result);
          });
        });
        step('create auth entry', async function () {
          await db.context(async (dbCtx) => {
            await db.authenticationUpsert(dbCtx, identifier, credential);
          });
        });
        step('get auth entry', async function () {
          await db.context(async (dbCtx) => {
            const authInfo = await db.authenticationGet(dbCtx, identifier);
            assert.strictEqual(authInfo.credential, credential);
            db._validateAuthentication(authInfo);
          });
        });
        step('valid auth event', async function () {
          await db.context(async (dbCtx) => {
            await db.authenticationSuccess(dbCtx, identifier);
            const authInfo = await db.authenticationGet(dbCtx, identifier);
            db._validateAuthentication(authInfo);
            assert.notStrictEqual(authInfo.lastAuthentication, undefined);
          });
        });
        step('update auth entry', async function () {
          await db.context(async (dbCtx) => {
            credential = '$plain$myNewPassword';
            await db.authenticationUpsert(dbCtx, identifier, credential, otpKey);
            const authInfo = await db.authenticationGet(dbCtx, identifier);
            assert.strictEqual(authInfo.credential, credential);
            assert.strictEqual(authInfo.otpKey, otpKey);
          });
        });
        step('update auth credential', async function () {
          await db.context(async (dbCtx) => {
            credential = '$plain$anotherNewPassword';
            await db.authenticationUpdateCredential(dbCtx, identifier, credential);
            const authInfo = await db.authenticationGet(dbCtx, identifier);
            assert.strictEqual(authInfo.credential, credential);
          });
        });
        step('update auth otp', async function () {
          await db.context(async (dbCtx) => {
            await db.authenticationUpdateOTPKey(dbCtx, identifier, otpKey);
            const authInfo = await db.authenticationGet(dbCtx, identifier);
            assert.strictEqual(authInfo.otpKey, otpKey);
          });
        });
        step('profile is not valid', async function () {
          await db.context(async (dbCtx) => {
            const isValid = await db.profileIsValid(dbCtx, profile);
            assert.strictEqual(isValid, false);
          });
        });
        step('user-profile relation does not exist', async function () {
          await db.context(async (dbCtx) => {
            const { profiles } = await db.profilesScopesByIdentifier(dbCtx, identifier);
            const exists = profiles.includes(profile);
            assert.strictEqual(exists, false);
          });
        });
        step('create user-profile relation', async function () {
          await db.context(async (dbCtx) => {
            await db.profileIdentifierInsert(dbCtx, profile, identifier);
          });
        });
        step('profile is valid', async function () {
          await db.context(async (dbCtx) => {
            const isValid = await db.profileIsValid(dbCtx, profile);
            assert.strictEqual(isValid, true);
          });
        });
        step('user-profile relation does exist', async function () {
          await db.context(async (dbCtx) => {
            const { profiles } = await db.profilesScopesByIdentifier(dbCtx, identifier);
            const exists = profiles.includes(profile);
            assert.strictEqual(exists, true);
          });
        });
        step('create scope', async function () {
          await db.context(async (dbCtx) => {
            await db.scopeUpsert(dbCtx, 'new_scope', '', 'Allows something to happen.');
          });
        });
        step('create and delete scope', async function () {
          await db.context(async (dbCtx) => {
            await db.scopeUpsert(dbCtx, 'sacrificial', 'No App', 'Exists to be destroyed.', true);
            const result = await db.scopeDelete(dbCtx, 'sacrificial');
            assert.strictEqual(result, true);
          });
        });
        step('do not delete in-use scope', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.scopeDelete(dbCtx, 'profile');
            assert.strictEqual(result, false);
          });
        });
        step('ignore delete of non-existent scope', async function () {
          await db.context(async (dbCtx) => {
            await db.scopeDelete(dbCtx, 'non-existent');
          });
        });
        step('assign scope to profile', async function () {
          const scope = 'new_scope';
          await db.context(async (dbCtx) => {
            await db.profileScopeInsert(dbCtx, profile, scope);
            const { scopeIndex, profileScopes, profiles } = await db.profilesScopesByIdentifier(dbCtx, identifier);
            const scopeExistsInProfile = scope in profileScopes[profile];
            const profileExistsInScope = scopeIndex[scope].profiles.includes(profile);
            const profileExists = profiles.includes(profile);
            assert.strictEqual(scopeExistsInProfile, true);
            assert.strictEqual(profileExistsInScope, true);
            assert.strictEqual(profileExists, true);
          });
        });
        step('update scope', async function () {
          await db.context(async (dbCtx) => {
            await db.scopeUpsert(dbCtx, 'new_scope', 'Application', 'Updated description.');
          });
        });
        step('re-assigning scope to profile is ignored', async function () {
          const scope = 'new_scope';
          await db.context(async (dbCtx) => {
            await db.profileScopeInsert(dbCtx, profile, scope);
            const { scopeIndex, profileScopes } = await db.profilesScopesByIdentifier(dbCtx, identifier);
            const scopeExistsInProfile = scope in profileScopes[profile];
            const profileExistsInScope = scopeIndex[scope].profiles.includes(profile);
            assert.strictEqual(scopeExistsInProfile, true);
            assert.strictEqual(profileExistsInScope, true);
          });
        });
        step('clear all scopes for a profile', async function () {
          const scopes = [];
          await db.context(async (dbCtx) => {
            await db.profileScopesSetAll(dbCtx, profile, scopes);
            const { profileScopes } = await db.profilesScopesByIdentifier(dbCtx, identifier);
            const exists = profile in profileScopes;
            assert(exists);
            const numScopes = Object.keys(profileScopes[profile]).length;
            assert.strictEqual(numScopes, 0);
          });
        });
        step('set multiple scopes for a profile', async function () {
          const scopes = ['profile', 'email', 'create'];
          await db.context(async (dbCtx) => {
            await db.profileScopesSetAll(dbCtx, profile, scopes);
            const { profileScopes } = await db.profilesScopesByIdentifier(dbCtx, identifier);
            assert.strictEqual(Object.keys(profileScopes[profile]).length, scopes.length);
          });
        });
        step('garbage-collect client scopes', async function () {
          await db.context(async (dbCtx) => {
            await db.scopeUpsert(dbCtx, 'extra_scope', 'useless', 'useless');
            const result = await db.scopeCleanup(dbCtx, 0);
            assert(result);
          });
        });
        step('too-soon garbage-collect skips', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.scopeCleanup(dbCtx, 86400000);
            assert.strictEqual(result, undefined);
          });
        });
      }); // Users and Profiles and Scopes

      describe('Token', function () {
        let created, codeId, profileCodeId, ticketCodeId, scopes, clientId, lifespanSeconds, resource;
        beforeEach(function () {
          created = new Date();
          codeId = '907a95fc-384b-11ec-a541-0025905f714a';
          profileCodeId = '93d6314a-384e-11ec-94e4-0025905f714a';
          ticketCodeId = 'bc5c39a8-5ca0-11ed-94cd-0025905f714a';
          clientId = 'https://app.example.com/';
          scopes = ['create', 'email', 'profile'];
          lifespanSeconds = 600;
          resource = 'https://example.com/profile/feed';
        });
        step('redeems code for token', async function () {
          await db.context(async (dbCtx) => {
            lifespanSeconds = null;
            const result = await db.redeemCode(dbCtx, {
              created,
              codeId,
              isToken: true,
              clientId,
              profile,
              identifier,
              scopes,
              lifespanSeconds,
              refreshLifespanSeconds: null,
              profileData: null,
            });
            assert.strictEqual(result, true);
            const t = await db.tokenGetByCodeId(dbCtx, codeId);
            assert(t);
            db._validateToken(t);
          });
        });
        step('revokes token', async function () {
          await db.context(async (dbCtx) => {
            await db.tokenRevokeByCodeId(dbCtx, codeId, identifier);
            const t = await db.tokenGetByCodeId(dbCtx, codeId);
            assert.strictEqual(t.isRevoked, true);
          });
        });
        step('redeems code for profile', async function () {
          await db.context(async (dbCtx) => {
            await db.redeemCode(dbCtx, {
              created,
              codeId: profileCodeId,
              isToken: false,
              clientId,
              profile,
              identifier,
              lifespanSeconds,
              scopes,
            });
            const t = await db.tokenGetByCodeId(dbCtx, codeId);
            assert(t);
            db._validateToken(t);
          });
        });
        step('redeems ticket', async function () {
          await db.context(async (dbCtx) => {
            await db.redeemCode(dbCtx, {
              created,
              codeId: ticketCodeId,
              isToken: true,
              clientId,
              resource,
              profile,
              identifier,
              scopes,
            });
          });
        });
        step('gets tokens', async function () {
          await db.context(async (dbCtx) => {
            const tokens = await db.tokensGetByIdentifier(dbCtx, identifier);
            assert(tokens.length);
          });
        });
        step('revokes multiply-redeemed code', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.redeemCode(dbCtx, {
              created,
              codeId,
              isToken: false,
              clientId,
              profile,
              identifier,
              scopes,
            });
            assert.strictEqual(result, false);
            const t = await db.tokenGetByCodeId(dbCtx, codeId);
            assert.strictEqual(t.isRevoked, true);
          });
        });
        step('garbage-collect tokens', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.tokenCleanup(dbCtx, -86400, 0);
            assert(result);
          });
        });
        step('too-soon garbage-collect skips', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.tokenCleanup(dbCtx, 0, 86400000);
            assert.strictEqual(result, undefined);
          });
        });
        step('garbage collection is recorded', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.almanacGetAll(dbCtx);
            assert(result?.length);
          });
        });
      }); // Token

      describe('Ticket Token Tracking', function () {
        let redeemedData;
        beforeEach(function () {
          redeemedData = {
            subject: 'https://entity.example.com/',
            resource: 'https://blog.example.com/secret_entry',
            iss: 'https://idp.example.com/',
            ticket: 'xxxTICKETxxx',
            token: 'xxxTOKENxxx',
          };
        });
        step('stores redeemed ticket data', async function () {
          await db.context(async (dbCtx) => {
            await db.ticketRedeemed(dbCtx, redeemedData);
          });
        });
        step('gets one pending-publish ticket tokens', async function () {
          await db.context(async (dbCtx) => {
            const unpublished = await db.ticketTokenGetUnpublished(dbCtx);
            assert.strictEqual(unpublished.length, 1);
            const record = unpublished[0];
            assert(record.created);
            assert(!record.published);
            assert(record.ticketId);
            delete record.created;
            delete record.published;
            delete record.ticketId;
            assert.deepStrictEqual(record, redeemedData);
          });
        });
        step('stores published ticket token data', async function () {
          await db.context(async (dbCtx) => {
            await db.ticketTokenPublished(dbCtx, redeemedData);
          });
        });
        step('gets no pending-publish ticket tokens', async function () {
          await db.context(async (dbCtx) => {
            const unpublished = await db.ticketTokenGetUnpublished(dbCtx);
            assert.strictEqual(unpublished.length, 0);
          });
        });
      }); // Ticket Token Tracking

      describe('Bookkeeping', function () {
        let event, date;
        beforeEach(function () {
          event = 'integrationTestEvent';
          date = new Date('Fri Dec 22 03:27 UTC 2023');
        });
        step('inserts event', async function () {
          await db.context(async (dbCtx) => {
            await db.almanacUpsert(dbCtx, event, date);
            const result = await db.almanacGetAll(dbCtx);
            const [storedEvent] = result.filter((e) => e.event === event);
            assert.deepStrictEqual(storedEvent.date, date);
          });
        });
      }); // Bookkeeping

      describe('Refreshable Token', function () {
        let created, codeId, scopes, clientId, profileData, lifespanSeconds, refreshLifespanSeconds, removeScopes;
        beforeEach(function () {
          created = new Date();
          codeId = '20ff1c5e-24d9-11ed-83b9-0025905f714a';
          scopes = ['profile', 'email', 'create', 'fancy:scope'];
          clientId = 'https://app.example.com/';
          lifespanSeconds = 86400;
          refreshLifespanSeconds = 172800;
          profileData = {
            url: 'https://profile.example.com/',
            name: 'Namey McUser',
            photo: 'https://profile.example.com/picture.jpg',
            email: 'usey@example.com',
          };
          removeScopes = [];
        });
        step('redeems code for refreshable token', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.redeemCode(dbCtx, {
              created,
              codeId,
              isToken: true,
              clientId,
              profile,
              identifier,
              scopes,
              lifespanSeconds,
              refreshLifespanSeconds,
              profileData,
            });
            assert.strictEqual(result, true);
            const t = await db.tokenGetByCodeId(dbCtx, codeId);
            assert(t);
            db._validateToken(t);
            const requestedScopesSet = new Set(scopes);
            const tokenScopesSet = new Set(t.scopes);
            for (const s of tokenScopesSet) {
              if (requestedScopesSet.has(s)) {
                requestedScopesSet.delete(s);
              } else {
                requestedScopesSet.add(s);
              }
            }
            assert(!requestedScopesSet.size, [...requestedScopesSet].toString());
          });
        });
        step('refreshes token', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.refreshCode(dbCtx, codeId, new Date(), removeScopes);
            assert(result);
            assert(result.expires);
            assert(result.refreshExpires);
            assert(!result.scopes);
          });
        });
        step('refreshes token and reduces scope', async function () {
          await db.context(async (dbCtx) => {
            removeScopes = ['create', 'fancy:scope'];
            const result = await db.refreshCode(dbCtx, codeId, new Date(), removeScopes);
            assert(result);
            assert(result.scopes);
            const t = await db.tokenGetByCodeId(dbCtx, codeId);
            const remainingScopesSet = new Set(scopes);
            removeScopes.forEach((s) => remainingScopesSet.delete(s));
            const tokenScopesSet = new Set(t.scopes);
            for (const s of tokenScopesSet) {
              if (remainingScopesSet.has(s)) {
                remainingScopesSet.delete(s);
              } else {
                remainingScopesSet.add(s);
              }
            }
            assert(!remainingScopesSet.size, [...remainingScopesSet].toString());

          });
        });
        step('revokes token refreshability', async function () {
          await db.context(async (dbCtx) => {
            await db.tokenRefreshRevokeByCodeId(dbCtx, codeId);
            const t = await db.tokenGetByCodeId(dbCtx, codeId);
            assert(!t.refreshExpires);
          });
        });
        step('token not refreshable', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.refreshCode(dbCtx, codeId, new Date(), removeScopes);
            assert(!result);
          });
        });
      }); // Refreshable Token

    }); // specific implementation
  }); // foreach

}); // Database Integration
