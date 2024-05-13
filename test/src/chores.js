'use strict';

const assert = require('assert');
const sinon = require('sinon');
const StubDB = require('../stub-db');
const StubLogger = require('../stub-logger');
const Chores = require('../../src/chores');

const snooze = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const expectedException = new Error('oh no');

describe('Chores', function () {
  let chores, stubLogger, stubDb, stubQueuePublisher, options;
  beforeEach(function () {
    stubLogger = new StubLogger();
    stubLogger._reset();
    stubDb = new StubDB();
    stubDb._reset();
    stubQueuePublisher = {
      publish: sinon.stub(),
    };
  });
  afterEach(function () {
    chores?.stopAllChores();
    sinon.restore();
  });

  describe('constructor', function () {
    this.slow(200);
    it('empty options, no cleaning', async function () {
      options = undefined;
      chores = new Chores(stubLogger, stubDb, stubQueuePublisher, options);
      assert.strictEqual(chores.chores.cleanTokens.timeoutObj, undefined);
      assert.strictEqual(chores.chores.cleanScopes.timeoutObj, undefined);
      assert.strictEqual(chores.chores.publishTickets.timeoutObj, undefined);
    });

    it('cleans scopes', async function () {
      options = {
        chores: {
          scopeCleanupMs: 1,
        },
      };
      chores = new Chores(stubLogger, stubDb, stubQueuePublisher, options);
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
      chores = new Chores(stubLogger, stubDb, stubQueuePublisher, options);
      await snooze(50);
      assert(chores.chores.cleanTokens.timeoutObj);
      assert(chores.db.tokenCleanup.called);
    });

    it('publishes tickets', async function () {
      options = {
        chores: {
          publishTicketsMs: 1,
        },
        queues: {
          ticketRedeemedName: 'queue',
        },
      };
      chores = new Chores(stubLogger, stubDb, stubQueuePublisher, options);
      await snooze(50);
      assert(chores.chores.publishTickets.timeoutObj);
      assert(chores.db.ticketTokenGetUnpublished.called);
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
      chores = new Chores(stubLogger, stubDb, stubQueuePublisher, options);
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
      chores = new Chores(stubLogger, stubDb, stubQueuePublisher, options);
      await assert.rejects(() => chores.cleanTokens(), expectedException);
    });
    it('covers default', async function () {
      stubDb.tokenCleanup.resolves(0);
      chores = new Chores(stubLogger, stubDb, stubQueuePublisher, {
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
      chores = new Chores(stubLogger, stubDb, stubQueuePublisher, options);
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
      chores = new Chores(stubLogger, stubDb, stubQueuePublisher, options);
      await assert.rejects(() => chores.cleanScopes(), expectedException);
    });
    it('covers default', async function () {
      stubDb.scopeCleanup.resolves(0);
      chores = new Chores(stubLogger, stubDb, stubQueuePublisher, {});
      await chores.cleanScopes();
      assert(stubDb.scopeCleanup.called);
    });
  }); // cleanScopes

  describe('publishTickets', function () {
    beforeEach(function () {
      options = {
        queues: {
          ticketRedeemedName: 'queue',
        },
      };
      stubDb.ticketTokenGetUnpublished.resolves([{
        ticket: 'xxxTICKETxxx',
        resource: 'https://resource.example.com/',
        subject: 'https://subject.example.com/',
        iss: null,
      }]);
      chores = new Chores(stubLogger, stubDb, stubQueuePublisher, options);
    });
    it('publishes a ticket', async function () {
      await chores.publishTickets();
      assert(stubQueuePublisher.publish.called);
      assert(stubDb.ticketTokenPublished.called);
    });
    it('covers error', async function () {
      stubQueuePublisher.publish.rejects(expectedException);
      await chores.publishTickets();
      assert(stubQueuePublisher.publish.called);
      assert(stubDb.ticketTokenPublished.notCalled);
    });
  }); // publishTickets

}); // Chores
