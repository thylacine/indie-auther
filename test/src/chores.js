/* eslint-env mocha */
/* eslint-disable node/no-unpublished-require */
'use strict';

const assert = require('assert');
const sinon = require('sinon');
const StubDB = require('../stub-db');
const StubLogger = require('../stub-logger');
const Chores = require('../../src/chores');

const snooze = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const expectedException = new Error('oh no');

describe('Chores', function () {
  let chores, stubLogger, stubDb, options;
  beforeEach(function () {
    stubLogger = new StubLogger();
    stubLogger._reset();
    stubDb = new StubDB();
    stubDb._reset();
  });
  afterEach(function () {
    chores?.stopAllChores();
    sinon.restore();
  });

  describe('constructor', function () {

    it('empty options, no cleaning', async function () {
      options = undefined;
      chores = new Chores(stubLogger, stubDb, options);
      assert.strictEqual(chores.chores.cleanTokens.timeoutObj, undefined);
      assert.strictEqual(chores.chores.cleanScopes.timeoutObj, undefined);
    });

    it('cleans scopes', async function () {
      options = {
        chores: {
          scopeCleanupMs: 1,
        },
      };
      chores = new Chores(stubLogger, stubDb, options);
      await snooze(50);
      assert(chores.chores.cleanScopes.timeoutObj);
      assert(chores.db.scopeCleanup.called);
    });

    it('cleans tokens', async function () {
      options = {
        chores: {
          tokenCleanupMs: 1,
        },
        manager: {
          codeValidityTimeoutMs: 10,
        },
      };
      chores = new Chores(stubLogger, stubDb, options);
      await snooze(50);
      assert(chores.chores.cleanTokens.timeoutObj);
      assert(chores.db.tokenCleanup.called);
    });

  }); // constructor

  describe('cleanTokens', function () {
    it('logs cleaning', async function () {
      const cleaned = 10;
      options = {
        chores: {
          tokenCleanupMs: 100,
        },
        manager: {
          codeValidityTimeoutMs: 10,
        },
      };
      stubDb.tokenCleanup.resolves(cleaned);
      chores = new Chores(stubLogger, stubDb, options);
      clearTimeout(chores.cleanTokensTimeout);
      await chores.cleanTokens();
      assert(stubLogger.info.called);
    });
    it('covers failure', async function () {
      options = {
        chores: {
          tokenCleanupMs: 1,
        },
        manager: {
          codeValidityTimeoutMs: 10,
        },
      };
      stubDb.tokenCleanup.rejects(expectedException);
      chores = new Chores(stubLogger, stubDb, options);
      await assert.rejects(() => chores.cleanTokens(), expectedException);
    });
    it('covers default', async function () {
      stubDb.tokenCleanup.resolves(0);
      chores = new Chores(stubLogger, stubDb, {
        manager: {
          codeValidityTimeoutMs: 10,
        },
      });
      await chores.cleanTokens();
      assert(stubDb.tokenCleanup.called);
    });
  }); // cleanTokens

  describe('cleanScopes', function () {
    it('logs cleaning', async function () {
      const cleaned = 10;
      options = {
        chores: {
          scopeCleanupMs: 100,
        },
      };
      stubDb.scopeCleanup.resolves(cleaned);
      chores = new Chores(stubLogger, stubDb, options);
      clearTimeout(chores.cleanScopesTimeout);
      await chores.cleanScopes();
      assert(stubLogger.info.called);
    });
    it('covers failure', async function () {
      options = {
        chores: {
          scopeCleanupMs: 1,
        },
      };
      stubDb.scopeCleanup.rejects(expectedException);
      chores = new Chores(stubLogger, stubDb, options);
      await assert.rejects(() => chores.cleanScopes(), expectedException);
    });
    it('covers default', async function () {
      stubDb.scopeCleanup.resolves(0);
      chores = new Chores(stubLogger, stubDb, {});
      await chores.cleanScopes();
      assert(stubDb.scopeCleanup.called);
    });
  }); // cleanScopes

}); // Chores