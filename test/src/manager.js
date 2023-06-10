/* eslint-env mocha */
/* eslint-disable capitalized-comments, sonarjs/no-duplicate-string, sonarjs/no-identical-functions */

'use strict';

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line node/no-unpublished-require

const Manager = require('../../src/manager');
const Config = require('../../config');
const Enum = require('../../src/enum');
const { ResponseError } = require('../../src/errors');
const { UnexpectedResult } = require('../../src/db/errors');
const dns = require('dns');

const StubDatabase = require('../stub-db');
const StubLogger = require('../stub-logger');

const expectedException = new Error('oh no');
const noExpectedException = 'did not get expected exception';

describe('Manager', function () {
  let manager, options, stubDb, logger;
  let req, res, ctx;

  beforeEach(function () {
    logger = new StubLogger();
    logger._reset();
    stubDb = new StubDatabase();
    stubDb._reset();
    options = new Config('test');
    req = {
      getHeader : sinon.stub(),
    };
    res = {
      end: sinon.stub(),
      setHeader: sinon.stub(),
      statusCode: 200,
    };
    ctx = {
      params: {},
      parsedBody: {},
      queryParams: {},
      session: {},
      errors: [],
      notifications: [],
    };
    manager = new Manager(logger, stubDb, options);
    sinon.stub(manager.communication, 'fetchProfile');
    sinon.stub(manager.communication, 'fetchClientIdentifier');
    sinon.stub(manager.communication, 'deliverTicket');
    sinon.stub(dns.promises, 'lookup').resolves([{ family: 4, address: '10.11.12.13' }]);
    sinon.stub(manager.queuePublisher, 'connect');
    sinon.stub(manager.queuePublisher, 'establishAMQPPlumbing');
    sinon.stub(manager.queuePublisher, 'publish');
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('constructor', function () {
    it('instantiates', function () {
      assert(manager);
    });
    it('covers no queuing', function () {
      options.queues.amqp.url = undefined;
      manager = new Manager(logger, stubDb, options);
      assert(manager);
    });
  }); // constructor

  describe('initialize', function () {
    let spy;
    beforeEach(function () {
      spy = sinon.spy(manager, '_connectQueues');
    });
    it('covers', async function () {
      await manager.initialize();
      assert(spy.called);
    });
    it('covers no queue', async function () {
      delete options.queues.amqp.url;
      manager = new Manager(logger, stubDb, options);
      await manager.initialize();
      assert(spy.notCalled);
    });
  }); // initialize

  describe('getRoot', function () {
    it('normal response', async function () {
      await manager.getRoot(res, ctx);
      assert(res.end.called);
    });
  }); // getRoot

  describe('getMeta', function () {
    it('normal response', async function () {
      await manager.getMeta(res, ctx);
      assert(res.end.called);
      JSON.parse(res.end.args[0][0]);
    });
    it('covers no ticket queue', async function () {
      delete options.queues.amqp.url;
      manager = new Manager(logger, stubDb, options);
      await manager.getMeta(res, ctx);
      assert(res.end.called);
    });
  }); // getMeta

  describe('getHealthcheck', function () {
    it('normal response', async function () {
      await manager.getHealthcheck(res, ctx);
      assert(res.end.called);
    });
  }); // getHealthcheck

  describe('getAuthorization', function () {
    it('covers missing redirect fields', async function () {
      await manager.getAuthorization(res, ctx);
      assert.strictEqual(res.statusCode, 400);
    });
    it('requires a configured profile', async function () {
      manager.db.profilesScopesByIdentifier.resolves({
        profileScopes: {
        },
        scopeIndex: {
          'profile': {
            description: '',
            profiles: [],
          },
          'email': {
            description: '',
            profiles: [],
          },
        },
        profiles: [],
      });
      manager.communication.fetchClientIdentifier.resolves({
        items: [],
      });
      ctx.authenticationId = 'username';
      Object.assign(ctx.queryParams, {
        'client_id': 'https://client.example.com/',
        'redirect_uri': 'https://client.example.com/action',
        'response_type': 'code',
        'state': '123456',
        'code_challenge_method': 'S256',
        'code_challenge': 'IZ9Jmupp0tvhT37e1KxfSZQXwcAGKHuVE51Z3xf5eog',
        'scope': 'profile email',
      });
      await manager.getAuthorization(res, ctx);
      assert.strictEqual(res.statusCode, 302);
      assert(ctx.session.error);
      assert(res.setHeader.called);
    });
    it('covers valid', async function () {
      manager.db.profilesScopesByIdentifier.resolves({
        profileScopes: {
          'https://profile.example.com/': {
            'create': {
              description: '',
              profiles: ['https://profile.example.com'],
            },
          },
        },
        scopeIndex: {
          'profile': {
            description: '',
            profiles: [],
          },
          'email': {
            description: '',
            profiles: [],
          },
          'create': {
            description: '',
            profiles: ['https://profile.example.com/'],
          },
        },
        profiles: ['https://profile.example.com/'],
      });
      manager.communication.fetchClientIdentifier.resolves({
        items: [],
      });
      ctx.authenticationId = 'username';
      Object.assign(ctx.queryParams, {
        'client_id': 'https://client.example.com/',
        'redirect_uri': 'https://client.example.com/action',
        'response_type': 'code',
        'state': '123456',
        'code_challenge_method': 'S256',
        'code_challenge': 'IZ9Jmupp0tvhT37e1KxfSZQXwcAGKHuVE51Z3xf5eog',
        'scope': 'profile email',
        'me': 'https://profile.example.com/',
      });
      await manager.getAuthorization(res, ctx);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(ctx.session.error, undefined);
      assert.strictEqual(ctx.session.errorDescriptions.length, 0);
      assert.strictEqual(ctx.notifications.length, 0);
    });
    it('succeeds with mismatched profile hint', async function () {
      manager.db.profilesScopesByIdentifier.resolves({
        profileScopes: {
          'https://profile.example.com/': {
            'create': {
              description: '',
              profiles: ['https://profile.example.com'],
            },
          },
        },
        scopeIndex: {
          'profile': {
            description: '',
            profiles: [],
          },
          'email': {
            description: '',
            profiles: [],
          },
          'create': {
            description: '',
            profiles: ['https://profile.example.com/'],
          },
        },
        profiles: ['https://profile.example.com/'],
      });
      manager.communication.fetchClientIdentifier.resolves({
        items: [],
      });
      ctx.authenticationId = 'username';
      Object.assign(ctx.queryParams, {
        'client_id': 'https://client.example.com/',
        'redirect_uri': 'https://client.example.com/action',
        'response_type': 'code',
        'state': '123456',
        'code_challenge_method': 'S256',
        'code_challenge': 'IZ9Jmupp0tvhT37e1KxfSZQXwcAGKHuVE51Z3xf5eog',
        'scope': 'profile email',
        'me': 'https://somethingelse.example.com/',
      });
      await manager.getAuthorization(res, ctx);
      assert(!('me' in ctx.session));
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(ctx.session.error, undefined);
      assert.strictEqual(ctx.session.errorDescriptions.length, 0);
    });
    it('covers invalid redirect', async function () {
      manager.db.profilesScopesByIdentifier.resolves({
        profileScopes: {
          'https://profile.example.com/': {
            'create': {
              description: '',
              profiles: ['https://profile.example.com'],
            },
          },
        },
        scopeIndex: {
          'profile': {
            description: '',
            profiles: [],
          },
          'email': {
            description: '',
            profiles: [],
          },
          'create': {
            description: '',
            profiles: ['https://profile.example.com/'],
          },
        },
        profiles: ['https://profile.example.com/'],
      });
      manager.communication.fetchClientIdentifier.resolves({
        items: [],
      });
      ctx.authenticationId = 'username';
      Object.assign(ctx.queryParams, {
        'client_id': 'https://client.example.com/',
        'redirect_uri': 'https://client.example.com/action',
        'response_type': 'blargl',
        'state': '',
        'code_challenge_method': 'S256',
        'code_challenge': 'IZ9Jmupp0tvhT37e1KxfSZQXwcAGKHuVE51Z3xf5eog',
      });
      await manager.getAuthorization(res, ctx);
      assert.strictEqual(res.statusCode, 302);
      assert.strictEqual(ctx.session.error, 'invalid_request');
      assert.strictEqual(ctx.session.errorDescriptions.length, 2);
    });
    it('covers legacy non-PKCE missing fields', async function () {
      manager.db.profilesScopesByIdentifier.resolves({
        profileScopes: {
          'https://profile.example.com/': {
            'create': {
              description: '',
              profiles: ['https://profile.example.com'],
            },
          },
        },
        scopeIndex: {
          'profile': {
            description: '',
            profiles: [],
          },
          'email': {
            description: '',
            profiles: [],
          },
          'create': {
            description: '',
            profiles: ['https://profile.example.com/'],
          },
        },
        profiles: ['https://profile.example.com/'],
      });
      manager.communication.fetchClientIdentifier.resolves({
        items: [],
      });
      ctx.authenticationId = 'username';
      Object.assign(ctx.queryParams, {
        'client_id': 'https://client.example.com/',
        'redirect_uri': 'https://client.example.com/action',
        'response_type': 'code',
        'state': '123456',
        'scope': 'profile email',
        'me': 'https://profile.example.com/',
      });
      manager.options.manager.allowLegacyNonPKCE = true;

      await manager.getAuthorization(res, ctx);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(ctx.session.error, undefined);
      assert.strictEqual(ctx.session.errorDescriptions.length, 0);
    });
    it('rejects legacy non-PKCE not missing all fields', async function () {
      manager.db.profilesScopesByIdentifier.resolves({
        profileScopes: {
          'https://profile.example.com/': {
            'create': {
              description: '',
              profiles: ['https://profile.example.com'],
            },
          },
        },
        scopeIndex: {
          'profile': {
            description: '',
            profiles: [],
          },
          'email': {
            description: '',
            profiles: [],
          },
          'create': {
            description: '',
            profiles: ['https://profile.example.com/'],
          },
        },
        profiles: ['https://profile.example.com/'],
      });
      manager.communication.fetchClientIdentifier.resolves({
        items: [],
      });
      ctx.authenticationId = 'username';
      Object.assign(ctx.queryParams, {
        'client_id': 'https://client.example.com/',
        'redirect_uri': 'https://client.example.com/action',
        'response_type': 'code',
        'code_challenge_method': 'S256',
        'state': '123456',
        'scope': 'profile email',
        'me': 'https://profile.example.com/',
      });
      manager.options.manager.allowLegacyNonPKCE = true;

      await manager.getAuthorization(res, ctx);
      assert.strictEqual(res.statusCode, 302);
      assert.strictEqual(ctx.session.error, 'invalid_request');
      assert.strictEqual(ctx.session.errorDescriptions.length, 1);
    });
    it('rejects legacy non-PKCE not missing all fields', async function () {
      manager.db.profilesScopesByIdentifier.resolves({
        profileScopes: {
          'https://profile.example.com/': {
            'create': {
              description: '',
              profiles: ['https://profile.example.com'],
            },
          },
        },
        scopeIndex: {
          'profile': {
            description: '',
            profiles: [],
          },
          'email': {
            description: '',
            profiles: [],
          },
          'create': {
            description: '',
            profiles: ['https://profile.example.com/'],
          },
        },
        profiles: ['https://profile.example.com/'],
      });
      manager.communication.fetchClientIdentifier.resolves({
        items: [],
      });
      ctx.authenticationId = 'username';
      Object.assign(ctx.queryParams, {
        'client_id': 'https://client.example.com/',
        'redirect_uri': 'https://client.example.com/action',
        'response_type': 'code',
        'code_challenge': 'xxx',
        'state': '123456',
        'scope': 'profile email',
        'me': 'https://profile.example.com/',
      });
      manager.options.manager.allowLegacyNonPKCE = true;

      await manager.getAuthorization(res, ctx);
      assert.strictEqual(res.statusCode, 302);
      assert.strictEqual(ctx.session.error, 'invalid_request');
      assert.strictEqual(ctx.session.errorDescriptions.length, 1);
    });  }); // getAuthorization

  describe('_setError', function () {
    it('covers', function () {
      const err = 'invalid_request';
      const errDesc = 'something went wrong';
      Manager._setError(ctx, err, errDesc);
    });
    it('covers bad error', function () {
      const err = 'floopy';
      const errDesc = 'something went wrong';
      try {
        Manager._setError(ctx, err, errDesc);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof RangeError);
      }
    });
    it('covers invalid error description', function () {
      const err = 'invalid_scope';
      const errDesc = 'something "went wrong"!';
      try {
        Manager._setError(ctx, err, errDesc);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof RangeError);
      }
    });
  }); // _setError

  describe('_clientIdRequired', function () {
    let clientIdentifier;
    beforeEach(function () {
      clientIdentifier = {
        // h-card here
      };
      manager.communication.fetchClientIdentifier.resolves(clientIdentifier);
    });
    it('covers valid', async function () {
      ctx.queryParams['client_id'] = 'https://client.example.com/';

      await manager._clientIdRequired(ctx);

      assert.deepStrictEqual(ctx.session.clientIdentifier, clientIdentifier);
      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);
    });
    it('requires client_id', async function () {
      ctx.queryParams['client_id'] = undefined;

      await manager._clientIdRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('requires valid client_id', async function () {
      ctx.queryParams['client_id'] = 'not a url';

      await manager._clientIdRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('rejects strange schema', async function () {
      ctx.queryParams['client_id'] = 'file:///etc/shadow';

      await manager._clientIdRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('rejects un-allowed parts', async function () {
      ctx.queryParams['client_id'] = 'https://user:pass@client.example.com/#here';

      await manager._clientIdRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('rejects relative paths', async function () {
      ctx.queryParams['client_id'] = 'https://client.example.com/x/../y/';

      await manager._clientIdRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('rejects ipv6 hostname', async function () {
      ctx.queryParams['client_id'] = 'https://[fd12:3456:789a:1::1]/';

      await manager._clientIdRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('allows ipv6 loopback hostname', async function () {
      ctx.queryParams['client_id'] = 'https://[::1]/';

      await manager._clientIdRequired(ctx);

      assert.deepStrictEqual(ctx.session.clientIdentifier, clientIdentifier);
      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);
    });
    it('rejects ipv4 hostname', async function () {
      ctx.queryParams['client_id'] = 'https://10.9.8.7/';

      await manager._clientIdRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('allows ipv4 loopback hostname', async function () {
      ctx.queryParams['client_id'] = 'https:/127.0.10.100/';

      await manager._clientIdRequired(ctx);

      assert.deepStrictEqual(ctx.session.clientIdentifier, clientIdentifier);
      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);
    });
    it('requires response', async function () {
      manager.communication.fetchClientIdentifier.restore();
      sinon.stub(manager.communication, 'fetchClientIdentifier').resolves();
      ctx.queryParams['client_id'] = 'https://client.example.com/';

      await manager._clientIdRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
  }); // _clientIdRequired

  describe('_redirectURIRequired', function () {
    beforeEach(function () {
      ctx.session.clientId = new URL('https://client.example.com/');
      ctx.session.clientIdentifier = {
        rels: {
          'redirect_uri': ['https://alternate.example.com/', 'https://other.example.com/'],
        },
      };
    });
    it('covers valid', function () {
      ctx.queryParams['redirect_uri'] = 'https://client.example.com/return';
  
      Manager._redirectURIRequired(ctx);

      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);
    });
    it('requires redirect_uri', function () {
      ctx.queryParams['redirect_uri'] = undefined;
  
      Manager._redirectURIRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('requires valid redirect_uri', function () {
      ctx.queryParams['redirect_uri'] = 'not a url';
  
      Manager._redirectURIRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('rejects no matching alternate redirect_uri from client_id', function () {
      ctx.queryParams['redirect_uri'] = 'https://unlisted.example.com/';
  
      Manager._redirectURIRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('allows alternate redirect_uri from client_id', function () {
      ctx.queryParams['redirect_uri'] = 'https://alternate.example.com/';
  
      Manager._redirectURIRequired(ctx);

      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);
    });
  }); // _redirectURIRequired

  describe('_responseTypeRequired', function () {
    it('covers valid', function () {
      ctx.queryParams['response_type'] = 'code';

      Manager._responseTypeRequired(ctx);

      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);
    });
    it('requires response_type', function () {
      ctx.queryParams['response_type'] = undefined;

      Manager._responseTypeRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('rejects invalid', function () {
      ctx.queryParams['response_type'] = 'flarp';

      Manager._responseTypeRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
  }); // _responseTypeRequired

  describe('_stateRequired', function () {
    it('covers valid', function () {
      ctx.queryParams['state'] = 'StateStateState';

      Manager._stateRequired(ctx);

      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);
    });
    it('requires state', function () {
      ctx.queryParams['state'] = undefined;

      Manager._stateRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
  }); // _stateRequired

  describe('_codeChallengeMethodRequired', function () {
    it('covers valid', function () {
      ctx.queryParams['code_challenge_method'] = 'S256';

      manager._codeChallengeMethodRequired(ctx);

      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);
    });
    it('requires code_challenge_method', function () {
      ctx.queryParams['code_challenge_method'] = undefined;

      manager._codeChallengeMethodRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('rejects invalid', function () {
      ctx.queryParams['code_challenge_method'] = 'MD5';

      manager._codeChallengeMethodRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('covers legacy non-PKCE', function () {
      ctx.queryParams['code_challenge_method'] = undefined;
      manager.options.manager.allowLegacyNonPKCE = true;

      manager._codeChallengeMethodRequired(ctx);

      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);
    });
  }); // _codeChallengeMethodRequired

  describe('_codeChallengeRequired', function () {
    it('covers valid', function () {
      ctx.queryParams['code_challenge'] = 'NBKNqs1TfjQFqpewPNOstmQ5MJnLoeTTbjqtQ9JbZOo';

      manager._codeChallengeRequired(ctx);

      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);
    });
    it('requires code_challenge', function () {
      ctx.queryParams['code_challenge'] = undefined;

      manager._codeChallengeRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('rejects invalid', function () {
      ctx.queryParams['code_challenge'] = 'not base64/url encoded';

      manager._codeChallengeRequired(ctx);

      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('covers legacy non-PKCE', function () {
      ctx.queryParams['code_challenge'] = undefined;
      manager.options.manager.allowLegacyNonPKCE = true;

      manager._codeChallengeRequired(ctx);

      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);

    });
  }); // _codeChallengeRequired

  describe('_redirectURIRequired', function () {
    beforeEach(function () {
      sinon.stub(Manager, '_setError');
      ctx.queryParams['redirect_uri'] = 'https://example.com/redirect';
      ctx.session.clientId = new URL('https://example.com/');
    });
    it('requires redirect_uri', function () {
      delete ctx.queryParams['redirect_uri'];
      Manager._redirectURIRequired(ctx);
      assert(Manager._setError.called);
    });
    it('requires valid redirect_uri', function () {
      ctx.queryParams['redirect_uri'] = 'not a uri';
      Manager._redirectURIRequired(ctx);
      assert(Manager._setError.called);
    });
    it('sets redirectUri if no clientId', function () {
      delete ctx.session.clientId;
      Manager._redirectURIRequired(ctx);
      assert(Manager._setError.notCalled);
      assert(ctx.session.redirectUri instanceof URL);
    });
    it('sets redirectUri if clientId matches', function () {
      Manager._redirectURIRequired(ctx);
      assert(Manager._setError.notCalled);
      assert(ctx.session.redirectUri instanceof URL);
    });
    it('rejects mis-matched', function () {
      ctx.queryParams['redirect_uri'] = 'https://example.com:8080/redirect';
      Manager._redirectURIRequired(ctx);
      assert(Manager._setError.called);
      assert.strictEqual(ctx.session.redirectUri, undefined);
    });
    it('allows client-specified alternate redirect uri', function () {
      ctx.session.clientIdentifier = {
        rels: {
          'redirect_uri': ['https://alternate.example.com/redirect'],
        },
      };
      ctx.queryParams['redirect_uri'] = 'https://alternate.example.com/redirect';
      Manager._redirectURIRequired(ctx);
      assert(Manager._setError.notCalled);
      assert(ctx.session.redirectUri instanceof URL);
    });
  }); // _redirectURIRequired

  describe('_scopeOptional', function () {
    it('covers valid', function () {
      ctx.queryParams['scope'] = 'profile email';
      manager._scopeOptional(ctx);
      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);
      assert.strictEqual(ctx.session.scope.length, 2);
    });
    it('allows empty', function () {
      ctx.queryParams['scope'] = undefined;
      manager._scopeOptional(ctx);
      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);
      assert.strictEqual(ctx.session.scope.length, 0);
    });
    it('rejects invalid scope combination', function () {
      ctx.queryParams['scope'] = 'email';
      manager._scopeOptional(ctx);
      assert(ctx.session.error);
      assert(ctx.session.errorDescriptions.length);
    });
    it('ignores invalid scope', function () {
      ctx.queryParams['scope'] = 'profile email "funny_business"';
      manager._scopeOptional(ctx);
      assert.strictEqual(ctx.session.error, undefined);
      assert.deepStrictEqual(ctx.session.errorDescriptions, undefined);
      assert.strictEqual(ctx.session.scope.length, 2);
    });
  }); // _scopeOptional

  describe('_meOptional', function () {
    this.beforeEach(function () {
      ctx.queryParams['me'] = 'https://profile.example.com/';
    });
    it('covers valid', async function () {
      await manager._meOptional(ctx);

      assert.strictEqual(ctx.session.me.href, ctx.queryParams['me']);
    });
    it('ignore invalid', async function () {
      ctx.queryParams['me'] = 'not a url';

      await manager._meOptional(ctx);

      assert.strictEqual(ctx.session.me, undefined);
    });
    it('allows empty', async function () {
      ctx.queryParams['me'] = undefined;

      await manager._meOptional(ctx);

      assert.strictEqual(ctx.session.me, undefined);
    });
  }); // _meOptional

  describe('_profileValidForIdentifier', function () {
    beforeEach(function () {
      ctx.session = {
        profiles: ['https://profile.example.com/', 'https://example.com/profile'],
        me: new URL('https://example.com/profile'),
      };
    });
    it('covers valid', async function () {

      const result = await manager._profileValidForIdentifier(ctx);

      assert.strictEqual(result, true);
    });
    it('covers missing me', async function () {
      delete ctx.session.me;

      const result = await manager._profileValidForIdentifier(ctx);

      assert.strictEqual(result, false);
    });
  }); // _profileValidForIdentifier

  describe('_parseLifespan', function () {
    let field, customField;
    beforeEach(function () {
      field = 'lifespan';
      customField = 'lifespan-seconds';
      ctx.parsedBody['lifespan'] = undefined;
      ctx.parsedBody['lifespan-seconds'] = undefined; 
    });
    it('returns nothing without fields', function () {
      const result = manager._parseLifespan(ctx, field, customField);
      assert.strictEqual(result, undefined);
    });
    it('returns nothing for unrecognized field', function () {
      ctx.parsedBody['lifespan'] = 'a while';
      const result = manager._parseLifespan(ctx, field, customField);
      assert.strictEqual(result, undefined);
    });
    it('returns recognized preset value', function () {
      ctx.parsedBody['lifespan'] = '1d';
      const result = manager._parseLifespan(ctx, field, customField);
      assert.strictEqual(result, 86400);
    });
    it('returns valid custom value', function () {
      ctx.parsedBody['lifespan'] = 'custom';
      ctx.parsedBody['lifespan-seconds'] = '123'; 
      const result = manager._parseLifespan(ctx, field, customField);
      assert.strictEqual(result, 123);
    });
    it('returns nothing for invalid custom value', function () {
      ctx.parsedBody['lifespan'] = 'custom';
      ctx.parsedBody['lifespan-seconds'] = 'Not a number'; 
      const result = manager._parseLifespan(ctx, field, customField);
      assert.strictEqual(result, undefined);
    });
    it('returns nothing for invalid custom value', function () {
      ctx.parsedBody['lifespan'] = 'custom';
      ctx.parsedBody['lifespan-seconds'] = '-50'; 
      const result = manager._parseLifespan(ctx, field, customField);
      assert.strictEqual(result, undefined);
    });
  }); // _parseLifespan

  describe('_parseConsentScopes', function () {
    it('covers no scopes', function () {
      const result = manager._parseConsentScopes(ctx);
      assert.deepStrictEqual(result, []);
    });
    it('filters invalid scopes', function () {
      ctx.parsedBody['accepted_scopes'] = ['read', 'email'];
      ctx.parsedBody['ad_hoc_scopes'] = 'bad"scope  create ';
      const result = manager._parseConsentScopes(ctx);
      assert.deepStrictEqual(result, ['read', 'create']);
    });
  }); // _parseConsentScopes

  describe('_parseConsentMe', function () {
    beforeEach(function () {
      ctx.session.profiles = ['https://me.example.com/'];
    });
    it('covers valid', function () {
      const expected = 'https://me.example.com/';
      ctx.parsedBody['me'] = expected;
      const result = manager._parseConsentMe(ctx);
      assert(result);
      assert.strictEqual(result.href, expected);
    });
    it('rejects unsupported', function () {
      ctx.parsedBody['me'] = 'https://notme.example.com/';
      const result = manager._parseConsentMe(ctx);
      assert(!result);
      assert(ctx.session.error);
    });
    it('rejects invalid', function () {
      ctx.parsedBody['me'] = 'bagel';
      const result = manager._parseConsentMe(ctx);
      assert(!result);
      assert(ctx.session.error);
    });
  }); // _parseConsentMe

  describe('_fetchConsentProfileData', function () {
    let profileResponse;
    beforeEach(function () {
      profileResponse = {
        url: 'https://profile.example.com/',
      };
      manager.communication.fetchProfile.resolves(profileResponse);
    });
    it('covers success', async function () {
      const expected = profileResponse;
      const result = await manager._fetchConsentProfileData(ctx);
      assert.deepStrictEqual(result, expected);
      assert(!ctx.session.error);
    });
    it('covers empty response', async function () {
      manager.communication.fetchProfile.resolves();
      const result = await manager._fetchConsentProfileData(ctx);
      assert.deepStrictEqual(result, undefined);
      assert(ctx.session.error);
    });
    it('covers failure', async function () {
      manager.communication.fetchProfile.rejects();
      const result = await manager._fetchConsentProfileData(ctx);
      assert.deepStrictEqual(result, undefined);
      assert(ctx.session.error);
    });
  }); // _fetchConsentProfileData

  describe('postConsent', function () {
    let oldSession;
    beforeEach(function () {
      sinon.stub(manager.mysteryBox, 'unpack');
      sinon.stub(manager.mysteryBox, 'pack');
      manager.communication.fetchProfile.resolves({
        url: 'https://profile.example.com/',
      });
      oldSession = {
        clientId: 'https://example.com/',
        redirectUri: 'https://example.com/_redirect',
        profiles: ['https://profile.example.com/'],
      };
      manager.mysteryBox.unpack.resolves(oldSession);
      ctx.parsedBody['me'] = 'https://profile.example.com/';
      ctx.parsedBody['accept'] = 'true';
    });
    it('covers valid', async function () {
      await manager.postConsent(res, ctx);
      assert(!ctx.session.error, ctx.session.error);
      assert.strictEqual(res.statusCode, 302);
    });
    it('covers valid with expiration and refresh', async function () {
      ctx.parsedBody['expires'] = '1d';
      ctx.parsedBody['refresh'] = '1w';
      await manager.postConsent(res, ctx);
      assert(!ctx.session.error, ctx.session.error);
      assert.strictEqual(res.statusCode, 302);
    });
    it('covers denial', async function () {
      ctx.parsedBody['accept'] = 'false';
      await manager.postConsent(res, ctx);
      assert(ctx.session.error);
      assert.strictEqual(ctx.session.error, 'access_denied');
      assert.strictEqual(res.statusCode, 302);
    });
    it('covers profile fetch failure', async function () {
      manager.communication.fetchProfile.resolves();
      await manager.postConsent(res, ctx);
      assert.strictEqual(res.statusCode, 302);
      assert(ctx.session.error);
    });
    it('covers bad code', async function () {
      manager.mysteryBox.unpack.rejects();
      await manager.postConsent(res, ctx);
      assert.strictEqual(res.statusCode, 400);
      assert(ctx.session.error);
    });
    it('removes email scope without profile', async function () {
      ctx.parsedBody['accepted_scopes'] = ['email', 'create'];
      await manager.postConsent(res, ctx);
      assert(!ctx.session.acceptedScopes.includes('email'));
    });
    it('merges valid ad-hoc scopes', async function () {
      ctx.parsedBody['accepted_scopes'] = ['email', 'create'];
      ctx.parsedBody['ad_hoc_scopes'] = '  my:scope  "badScope';
      await manager.postConsent(res, ctx);
      assert(ctx.session.acceptedScopes.includes('my:scope'));
    });
    it('covers invalid selected me profile', async function () {
      ctx.parsedBody['me'] = 'https://different.example.com/';
      await manager.postConsent(res, ctx);
      assert(ctx.session.error);
    });
    it('covers invalid me url', async function () {
      ctx.parsedBody['me'] = 'bagel';
      await manager.postConsent(res, ctx);
      assert(ctx.session.error);
    });
    it('covers profile fetch error', async function () {
      manager.communication.fetchProfile.rejects(expectedException);
      await manager.postConsent(res, ctx);
      assert.strictEqual(res.statusCode, 302);
      assert(ctx.session.error);
    });
  }); // postConsent

  describe('postAuthorization', function () {
    let code, parsedBody;
    beforeEach(function () {
      sinon.stub(manager.mysteryBox, 'unpack');
      code = {
        codeId: 'cffe1558-35f0-11ec-98bc-0025905f714a',
        codeChallengeMethod: 'S256',
        codeChallenge: 'iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ',
        clientId: 'https://app.example.com/',
        redirectUri: 'https://app.example.com/_redirect',
        acceptedScopes: ['profile'],
        minted: Date.now(),
        me: 'https://client.example.com/',
        identifier: 'username',
        profile: {
          name: 'Firsty McLastname',
          email: 'f.mclastname@example.com',
        },
      };
      parsedBody = {
        code: 'codeCodeCode',
        'client_id': 'https://app.example.com/',
        'redirect_uri': 'https://app.example.com/_redirect',
        'grant_type': 'authorization_code',
        'code_verifier': 'verifier',
      };
    });
    it('covers valid', async function () {
      manager.db.redeemCode.resolves(true);
      manager.mysteryBox.unpack.resolves(code);
      Object.assign(ctx.parsedBody, parsedBody);

      await manager.postAuthorization(res, ctx);
      assert(!ctx.session.error, ctx.session.error);
      assert(!res.end.firstCall.args[0].includes('email'));
    });
    it('includes email if accepted in scope', async function () {
      code.acceptedScopes = ['profile', 'email'];
      manager.db.redeemCode.resolves(true);
      manager.mysteryBox.unpack.resolves(code);
      Object.assign(ctx.parsedBody, parsedBody);

      await manager.postAuthorization(res, ctx);
      assert(!ctx.session.error);
      assert(res.end.firstCall.args[0].includes('email'));
    });
    it('fails if already redeemed', async function () {
      manager.db.redeemCode.resolves(false);
      manager.mysteryBox.unpack.resolves(code);
      Object.assign(ctx.parsedBody, parsedBody);

      await manager.postAuthorization(res, ctx);
      assert(ctx.session.error);
    });
    it('covers bad request', async function () {
      manager.mysteryBox.unpack.rejects(expectedException);
      Object.assign(ctx.parsedBody, parsedBody);

      await manager.postAuthorization(res, ctx);
      assert(ctx.session.error);
    });
  }); // postAuthorization

  describe('_ingestPostAuthorizationRequest', function () {
    beforeEach(function () {
      sinon.stub(manager, '_restoreSessionFromCode');
      sinon.stub(manager, '_checkSessionMatchingClientId');
      sinon.stub(manager, '_checkSessionMatchingRedirectUri');
      sinon.stub(manager, '_checkGrantType');
      sinon.stub(manager, '_checkSessionMatchingCodeVerifier');
    });
    it('covers valid', async function () {
      manager._restoreSessionFromCode.callsFake((ctx) => {
        ctx.session = {
          me: 'https://profile.example.com/',
          minted: Date.now(),
        };
      });

      await manager._ingestPostAuthorizationRequest(ctx);
      assert(!ctx.session.error);
    });
    it('requires data', async function () {
      delete ctx.parsedBody;
      await manager._ingestPostAuthorizationRequest(ctx);
      assert(ctx.session.error);
    });
    it('requires me field', async function () {
      manager._restoreSessionFromCode.callsFake((ctx) => {
        ctx.session = {
          minted: Date.now(),
        };
      });
      await manager._ingestPostAuthorizationRequest(ctx);
      assert(ctx.session.error);
    });
    it('requires minted field', async function () {
      manager._restoreSessionFromCode.callsFake((ctx) => {
        ctx.session = {
          me: 'https://profile.example.com/',
        };
      });
      await manager._ingestPostAuthorizationRequest(ctx);
      assert(ctx.session.error);
    });
    it('rejects expired code', async function () {
      manager._restoreSessionFromCode.callsFake((ctx) => {
        ctx.session = {
          me: 'https://profile.example.com/',
          minted: Date.now() - 86400000,
        };
      });

      await manager._ingestPostAuthorizationRequest(ctx);
      assert(ctx.session.error);
    });
  }); // _ingestPostAuthorizationRequest

  describe('_restoreSessionFromCode', function () {
    let unpackedCode;
    beforeEach(function () {
      sinon.stub(manager.mysteryBox, 'unpack');
      unpackedCode = {
        codeId: 'cffe1558-35f0-11ec-98bc-0025905f714a',
        codeChallengeMethod: 'S256',
        codeChallenge: 'iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ',
        clientId: 'https://app.example.com/',
        redirectUri: 'https://app.example.com/_redirect',
        acceptedScopes: ['profile'],
        minted: Date.now(),
        me: 'https://client.example.com/',
        identifier: 'username',
        profile: {
          name: 'Firsty McLastname',
          email: 'f.mclastname@example.com',
        },
      };
    });
    it('covers valid', async function () {
      ctx.parsedBody['code'] = 'codeCodeCode';
      manager.mysteryBox.unpack.resolves(unpackedCode);
      const expected = Object.assign({}, ctx, {
        session: unpackedCode,
      });
      await manager._restoreSessionFromCode(ctx);
      assert.deepStrictEqual(ctx, expected);
      assert(!ctx.session.error);
    });
    it('requires code', async function () {
      ctx.parsedBody['code'] = '';
      manager.mysteryBox.unpack.resolves({
        me: 'https://example.com/me',
      });
      await manager._restoreSessionFromCode(ctx);
      assert(ctx.session.error);
    });
    it('covers invalid code', async function () {
      ctx.parsedBody['code'] = 'codeCodeCode';
      manager.mysteryBox.unpack.rejects();
      await manager._restoreSessionFromCode(ctx);
      assert(ctx.session.error);
    });
    it('covers missing code fields', async function () {
      ctx.parsedBody['code'] = 'codeCodeCode';
      delete unpackedCode.clientId;
      manager.mysteryBox.unpack.resolves(unpackedCode);
      await manager._restoreSessionFromCode(ctx);
      assert(ctx.session.error);
    });
    it('covers legacy non-PKCE missing fields', async function () {
      ctx.parsedBody['code'] = 'codeCodeCode';
      delete unpackedCode.codeChallengeMethod;
      delete unpackedCode.codeChallenge;
      manager.mysteryBox.unpack.resolves(unpackedCode);
      manager.options.manager.allowLegacyNonPKCE = true;
      const expected = Object.assign({}, ctx, {
        session: unpackedCode,
      });
      await manager._restoreSessionFromCode(ctx);
      assert.deepStrictEqual(ctx, expected);
      assert(!ctx.session.error);
    });
  }); // _restoreSessionFromCode

  describe('_checkSessionMatchingClientId', function () {
    it('covers valid', async function () {
      ctx.session = {
        clientId: 'https://client.example.com/',
      };
      ctx.parsedBody['client_id'] = 'https://client.example.com/';

      manager._checkSessionMatchingClientId(ctx);
      assert(!ctx.session.error);
    });
    it('covers missing', async function () {
      ctx.session = {
        clientId: 'https://client.example.com/',
      };
      ctx.parsedBody['client_id'] = undefined;

      manager._checkSessionMatchingClientId(ctx);
      assert(ctx.session.error);
    });
    it('covers un-parsable', async function () {
      ctx.session = {
        clientId: 'https://client.example.com/',
      };
      ctx.parsedBody['client_id'] = 'not a url';

      manager._checkSessionMatchingClientId(ctx);
      assert(ctx.session.error);
    });
    it('covers mismatch', async function () {
      ctx.session = {
        clientId: 'https://client.example.com/',
      };
      ctx.parsedBody['client_id'] = 'https://otherclient.example.com/';

      manager._checkSessionMatchingClientId(ctx);
      assert(ctx.session.error);
    });
  }); // _checkSessionMatchingClientId

  describe('_checkSessionMatchingRedirectUri', function () {
    it('covers valid', async function () {
      ctx.parsedBody['redirect_uri'] = 'https://client.example.com/_redirect';
      ctx.session.redirectUri = 'https://client.example.com/_redirect';

      manager._checkSessionMatchingRedirectUri(ctx);
      assert(!ctx.session.error);
    });
    it('requires field', async function () {
      ctx.parsedBody['redirect_uri'] = undefined;
      ctx.session.redirectUri = 'https://client.example.com/_redirect';

      manager._checkSessionMatchingRedirectUri(ctx);
      assert(ctx.session.error);
    });
    it('requires valid field', async function () {
      ctx.parsedBody['redirect_uri'] = 'not a url';
      ctx.session.redirectUri = 'https://client.example.com/_redirect';

      manager._checkSessionMatchingRedirectUri(ctx);
      assert(ctx.session.error);
    });
    it('requires match', async function () {
      ctx.parsedBody['redirect_uri'] = 'https://client.example.com/other';
      ctx.session.redirectUri = 'https://client.example.com/_redirect';

      manager._checkSessionMatchingRedirectUri(ctx);
      assert(ctx.session.error);
    });
  }); // _checkSessionMatchingRedirectUri

  describe('_checkGrantType', function () {
    it('covers valid', async function () {
      ctx.parsedBody['grant_type'] = 'authorization_code';
      
      manager._checkGrantType(ctx);
      assert(!ctx.session.error);
    });
    it('allows missing, because of one client', async function () {
      ctx.parsedBody['grant_type'] = undefined;
      
      manager._checkGrantType(ctx);
      assert(!ctx.session.error);
    });
    it('rejects invalid', async function () {
      ctx.parsedBody['grant_type'] = 'pigeon_dance';
      
      manager._checkGrantType(ctx);
      assert(ctx.session.error);
    });
  }); // _checkGrantType

  describe('_checkSessionMatchingCodeVerifier', function () {
    it('covers valid', async function () {
      ctx.parsedBody['code_verifier'] = 'verifier';
      ctx.session.codeChallengeMethod = 'S256';
      ctx.session.codeChallenge = 'iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ';

      manager._checkSessionMatchingCodeVerifier(ctx);
      assert(!ctx.session.error);
    });
    it('requires field', async function () {
      ctx.parsedBody['code_verifier'] = undefined;
      ctx.session.codeChallengeMethod = 'S256';
      ctx.session.codeChallenge = 'iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ';

      manager._checkSessionMatchingCodeVerifier(ctx);
      assert(ctx.session.error);
    });
    it('requires match', async function () {
      ctx.parsedBody['code_verifier'] = 'wrongverifier';
      ctx.session.codeChallengeMethod = 'S256';
      ctx.session.codeChallenge = 'iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ';

      manager._checkSessionMatchingCodeVerifier(ctx);
      assert(ctx.session.error);
    });
    it('covers legacy non-PKCE missing fields', async function () {
      ctx.parsedBody['code_verifier'] = undefined;
      ctx.session.codeChallengeMethod = undefined;
      ctx.session.codeChallenge = undefined;
      manager.options.manager.allowLegacyNonPKCE = true;

      manager._checkSessionMatchingCodeVerifier(ctx);
      assert(!ctx.session.error);
    });
  }); // _checkSessionMatchingCodeVerifier

  describe('postToken', function () {
    let unpackedCode;
    beforeEach(function () {
      ctx.session.acceptedScopes = [];
      unpackedCode = {
        codeId: 'cffe1558-35f0-11ec-98bc-0025905f714a',
        codeChallengeMethod: 'S256',
        codeChallenge: 'iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ',
        clientId: 'https://app.example.com/',
        redirectUri: 'https://app.example.com/return',
        acceptedScopes: ['profile', 'email', 'tricks'],
        minted: Date.now(),
        me: 'https://client.example.com/',
        identifier: 'username',
        profile: {
          name: 'Firsty McLastname',
          email: 'f.mclastname@example.com',
          url: 'https://example.com/',
        },
      };
    });
    describe('Revocation (legacy)', function () {
      beforeEach(function () {
        sinon.stub(manager, '_revokeToken');
      });
      it('covers revocation', async function () {
        manager._revokeToken.resolves();
        ctx.parsedBody = {
          action: 'revoke',
          token: 'XXX',
        };
        await manager.postToken(req, res, ctx);
        assert(manager._revokeToken.called);
      });
    }); // Revocation
    describe('Validation (legacy)', function () {
      beforeEach(function () {
        sinon.stub(manager, '_validateToken');
        req.getHeader.returns({ Authorization: 'Bearer XXX' });
      });
      it('covers validation', async function () {
        ctx.bearer = { isValid: true };
        await manager.postToken(req, res, ctx);
        assert(manager._validateToken.called);
      });
    }); // Validation
    describe('Refresh', function () {
      beforeEach(function () {
        sinon.stub(manager, '_refreshToken');
      });
      it('covers refresh', async function () {
        ctx.parsedBody['grant_type'] = 'refresh_token';
        await manager.postToken(req, res, ctx);
        assert(manager._refreshToken.called);
      });
    }); // Refresh
    describe('Ticket Redemption', function () {
      beforeEach(function () {
        sinon.stub(manager, '_ticketAuthToken');
      });
      it('covers ticket', async function () {
        ctx.parsedBody['grant_type'] = 'ticket';
        await manager.postToken(req, res, ctx);
        assert(manager._ticketAuthToken.called);
      });
      it('covers no ticket queue', async function () {
        delete options.queues.amqp.url;
        manager = new Manager(logger, stubDb, options);
        sinon.stub(manager.communication, 'fetchProfile');
        sinon.stub(manager.communication, 'fetchClientIdentifier');
        sinon.stub(manager.communication, 'deliverTicket');

        ctx.parsedBody['grant_type'] = 'ticket';
        await assert.rejects(() => manager.postToken(req, res, ctx), ResponseError);
      });
    }); // Ticket Redemption
    describe('Code Redemption', function () {
      beforeEach(function () {
        sinon.stub(manager.mysteryBox, 'unpack');
        sinon.spy(manager.mysteryBox, 'pack');
        manager.mysteryBox.unpack.resolves(unpackedCode);
        ctx.parsedBody = {
          'redirect_uri': 'https://app.example.com/return',
          'code': 'xxx',
        };
      });
      it('covers invalid code', async function () {
        manager.mysteryBox.unpack.rejects(expectedException);
        try {
          await manager.postToken(req, res, ctx);
          assert.fail(noExpectedException);
        } catch (e) {
          assert(e instanceof ResponseError);
        }
      });
      it('covers mismatched redirect', async function () {
        ctx.parsedBody['redirect_uri'] = 'https://elsewhere.example.com/';
        try {
          await manager.postToken(req, res, ctx);
          assert.fail(noExpectedException);
        } catch (e) {
          assert(e instanceof ResponseError);
        }
      });
      it('covers success', async function () {
        manager.db.redeemCode.resolves(true);
        await manager.postToken(req, res, ctx);
        assert(res.end.called);
        assert.strictEqual(manager.mysteryBox.pack.callCount, 1);
      });
      it('covers success with refresh', async function () {
        manager.db.redeemCode.resolves(true);
        unpackedCode.refreshLifespan = 86400;
        unpackedCode.tokenLifespan = 86400;
        manager.mysteryBox.unpack.resolves(unpackedCode);
        await manager.postToken(req, res, ctx);
        assert(res.end.called);
        assert.strictEqual(manager.mysteryBox.pack.callCount, 2);
      });
      it('covers redemption failure', async function () {
        manager.db.redeemCode.resolves(false);
        try {
          await manager.postToken(req, res, ctx);
          assert.fail(noExpectedException);
        } catch (e) {
          assert(e instanceof ResponseError);
        }
      });
      it('removes email from profile if not in scope', async function () {
        manager.db.redeemCode.resolves(true);
        unpackedCode.acceptedScopes = ['profile', 'tricks'];
        manager.mysteryBox.unpack.resolves(unpackedCode);
        await manager.postToken(req, res, ctx);
        assert(res.end.called);
        const response = JSON.parse(res.end.args[0][0]);
        assert(!('email' in response.profile));
      });

    }); // Code Redemption
    describe('Invalid grant_type', function () {
      it('throws response error', async function () {
        ctx.parsedBody['grant_type'] = 'bad';
        try {
          await manager.postToken(req, res, ctx);
          assert.fail(noExpectedException);
        } catch (e) {
          assert(e instanceof ResponseError);
        }
      });
    }); // Invalid grant_type
  }); // postToken

  describe('_validateToken', function () {
    let dbCtx;
    beforeEach(function () {
      dbCtx = {};
      sinon.stub(manager, '_checkTokenValidationRequest');
    });
    it('covers valid token', async function () {
      ctx.bearer = {
        isValid: true,
      };
      ctx.token = {
      };
      await manager._validateToken(dbCtx, req, res, ctx);
      assert(res.end.called);
    });
    it('covers invalid token', async function () {
      ctx.bearer = {
        isValid: false,
      };
      await assert.rejects(manager._validateToken(dbCtx, req, res, ctx), ResponseError);
    });
    it('covers errors', async function () {
      ctx.bearer = {
        isValid: false,
      };
      ctx.session.error = 'error';
      ctx.session.errorDescriptions = ['error_description'];
      await assert.rejects(manager._validateToken(dbCtx, req, res, ctx), ResponseError);
    });
  }); // _validateToken

  describe('_checkTokenValidationRequest', function () {
    let dbCtx;
    beforeEach(function () {
      dbCtx = {};
      sinon.stub(manager.mysteryBox, 'unpack');
    });
    it('does nothing with no auth header', async function () {
      await manager._checkTokenValidationRequest(dbCtx, req, ctx);
    });
    it('does nothing with unknown auth header', async function () {
      req.getHeader.returns('flarp authy woo');
      await manager._checkTokenValidationRequest(dbCtx, req, ctx);
    });
    it('requires a valid auth token', async function () {
      manager.mysteryBox.unpack.rejects(expectedException);
      req.getHeader.returns('Bearer XXX');
      await manager._checkTokenValidationRequest(dbCtx, req, ctx);
      assert(ctx.session.error);
    });
    it('requires valid auth token fields', async function () {
      manager.mysteryBox.unpack.resolves({});
      req.getHeader.returns('Bearer XXX');
      await manager._checkTokenValidationRequest(dbCtx, req, ctx);
      assert(ctx.session.error)
    });
    it('covers no token', async function () {
      manager.mysteryBox.unpack.resolves({ c: 'xxx' });
      req.getHeader.returns('Bearer XXX');
      await manager._checkTokenValidationRequest(dbCtx, req, ctx);
      assert(ctx.session.error)
    });
    it('covers db error', async function () {
      manager.mysteryBox.unpack.resolves({ c: 'xxx' });
      manager.db.tokenGetByCodeId.rejects(expectedException);
      req.getHeader.returns('Bearer XXX');
      await assert.rejects(manager._checkTokenValidationRequest(dbCtx, req, ctx), expectedException);
    });
    it('valid token', async function () {
      manager.mysteryBox.unpack.resolves({ c: 'xxx' });
      manager.db.tokenGetByCodeId.resolves({
        isRevoked: false,
        expires: new Date(Date.now() + 86400000),
      });
      req.getHeader.returns('Bearer XXX');
      await manager._checkTokenValidationRequest(dbCtx, req, ctx);
      assert.strictEqual(ctx.bearer.isValid, true);
    });
    it('revoked token', async function () {
      manager.mysteryBox.unpack.resolves({ c: 'xxx' });
      manager.db.tokenGetByCodeId.resolves({
        isRevoked: true,
        expires: new Date(Date.now() + 86400000),
      });
      req.getHeader.returns('Bearer XXX');
      await manager._checkTokenValidationRequest(dbCtx, req, ctx);
      assert.strictEqual(ctx.bearer.isValid, false);
    });
    it('expired token', async function () {
      manager.mysteryBox.unpack.resolves({ c: 'xxx' });
      manager.db.tokenGetByCodeId.resolves({
        isRevoked: false,
        expires: new Date(Date.now() - 86400000),
      });
      req.getHeader.returns('Bearer XXX');
      await manager._checkTokenValidationRequest(dbCtx, req, ctx);
      assert.strictEqual(ctx.bearer.isValid, false);
    });
  }); // _checkTokenValidationRequest

  describe('postIntrospection', function () {
    let inactiveToken, activeToken, dbResponse;
    beforeEach(function () {
      dbResponse = {
        profile: 'https://profile.example.com/',
        clientId: 'https://client.example.com/',
        scopes: ['scope1', 'scope2'],
        created: new Date(),
        expires: Infinity,
      };
      inactiveToken = JSON.stringify({
        active: false,
      });
      activeToken = JSON.stringify({
        active: true,
        me: dbResponse.profile,
        'client_id': dbResponse.clientId,
        scope: dbResponse.scopes.join(' '),
        iat: Math.ceil(dbResponse.created.getTime() / 1000),
      });
      sinon.stub(manager.mysteryBox, 'unpack').resolves({ c: '7e9991dc-9cd5-11ec-85c4-0025905f714a' });
      manager.db.tokenGetByCodeId.resolves(dbResponse);
    });
    it('covers bad token', async function () {
      manager.mysteryBox.unpack.rejects();
      await manager.postIntrospection(res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.end.args[0][0], inactiveToken);
    });
    it('covers token not in db', async function () {
      manager.db.tokenGetByCodeId.resolves();
      await manager.postIntrospection(res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.end.args[0][0], inactiveToken);
    });
    it('covers valid token', async function () {
      await manager.postIntrospection(res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.end.args[0][0], activeToken);
    });
    it('covers expired token', async function () {
      dbResponse.expires = new Date((new Date()).getTime() - 86400000);
      await manager.postIntrospection(res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.end.args[0][0], inactiveToken);
    });
    it('covers expiring token', async function () {
      dbResponse.expires = new Date((new Date()).getTime() + 86400000);
      activeToken = JSON.stringify({
        active: true,
        me: dbResponse.profile,
        'client_id': dbResponse.clientId,
        scope: dbResponse.scopes.join(' '),
        iat: Math.ceil(dbResponse.created.getTime() / 1000),
        exp: Math.ceil(dbResponse.expires / 1000),
      });
      await manager.postIntrospection(res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.end.args[0][0], activeToken);
    });
    it('covers ticket', async function () {
      ctx.parsedBody['token_hint_type'] = 'ticket';
      const nowEpoch = Math.ceil(Date.now() / 1000);
      manager.mysteryBox.unpack.resolves({
        c: '515172ae-5b0b-11ed-a6af-0025905f714a',
        iss: nowEpoch - 86400,
        exp: nowEpoch + 86400,
        sub: 'https://subject.exmaple.com/',
        res: 'https://profile.example.com/feed',
        scope: ['read', 'role:private'],
        ident: 'username',
        profile: 'https://profile.example.com/',
      });
      await manager.postIntrospection(res, ctx);
      assert(res.end.called);
    });
  }); // postIntrospection

  describe('_revokeToken', function () {
    let dbCtx;
    beforeEach(function () {
      dbCtx = {};
    });
    it('requires token field', async function () {
      await manager._revokeToken(dbCtx, res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.statusCode, 400);
    });
    it('requires parsable token', async function () {
      sinon.stub(manager.mysteryBox, 'unpack').resolves({ notC: 'foop' });
      ctx.parsedBody['token'] = 'invalid token';
      ctx.parsedBody['token_type_hint'] = 'access_token';
      await manager._revokeToken(dbCtx, res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.statusCode, 400);
    });
    it('requires parsable token', async function () {
      sinon.stub(manager.mysteryBox, 'unpack').resolves();
      ctx.parsedBody['token'] = 'invalid token';
      ctx.parsedBody['token_type_hint'] = 'refresh_token';
      await manager._revokeToken(dbCtx, res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.statusCode, 400);
    });
    it('succeeds', async function () {
      sinon.stub(manager.mysteryBox, 'unpack').resolves({ c: '8e4aed9e-fa3e-11ec-992e-0025905f714a' });
      ctx.parsedBody['token'] = 'valid token';
      await manager._revokeToken(dbCtx, res, ctx);
      assert(manager.db.tokenRevokeByCodeId.called);
      assert(res.end.called);
    });
    it('succeeds for refresh token', async function () {
      sinon.stub(manager.mysteryBox, 'unpack').resolves({ rc: '8e4aed9e-fa3e-11ec-992e-0025905f714a' });
      ctx.parsedBody['token'] = 'valid token';
      await manager._revokeToken(dbCtx, res, ctx);
      assert(manager.db.tokenRefreshRevokeByCodeId.called);
      assert(res.end.called);
    });
    it('covers non-revokable token', async function () {
      sinon.stub(manager.mysteryBox, 'unpack').resolves({ c: '8e4aed9e-fa3e-11ec-992e-0025905f714a' });
      manager.db.tokenRevokeByCodeId.rejects(new UnexpectedResult());
      ctx.parsedBody['token'] = 'valid token';
      await manager._revokeToken(dbCtx, res, ctx);
      assert.strictEqual(res.statusCode, 404);
    });
    it('covers failure', async function () {
      sinon.stub(manager.mysteryBox, 'unpack').resolves({ c: '8e4aed9e-fa3e-11ec-992e-0025905f714a' });
      manager.db.tokenRevokeByCodeId.rejects(expectedException);
      ctx.parsedBody['token'] = 'valid token';
      ctx.parsedBody['token_type_hint'] = 'ignores_bad_hint';
      await assert.rejects(manager._revokeToken(dbCtx, res, ctx), expectedException, noExpectedException);
    });    
  }); // _revokeToken

  describe('_scopeDifference', function () {
    let previousScopes, requestedScopes;
    beforeEach(function () {
      previousScopes = ['a', 'b', 'c'];
      requestedScopes = ['b', 'c', 'd'];
    });
    it('covers', function () {
      const expected = ['a'];
      const result = Manager._scopeDifference(previousScopes, requestedScopes);
      assert.deepStrictEqual(result, expected);
    });
  }); // _scopeDifference

  describe('_refreshToken', function () {
    let dbCtx;
    beforeEach(function () {
      dbCtx = {};
      ctx.parsedBody['client_id'] = 'https://client.example.com/';
      const nowEpoch = Math.ceil(Date.now() / 1000);
      sinon.stub(manager.mysteryBox, 'unpack').resolves({
        rc: '03bb8ab0-1dc7-11ed-99f2-0025905f714a',
        ts: nowEpoch - 86400,
        exp: nowEpoch + 86400,
      });
      sinon.stub(manager.mysteryBox, 'pack').resolves('newToken');
      const futureDate = new Date(Date.now() + 86400000);
      manager.db.tokenGetByCodeId.resolves({
        refreshExpires: futureDate,
        duration: 86400,
        clientId: 'https://client.example.com/',
        scopes: ['profile', 'create'],
      });
      manager.db.refreshCode.resolves({
        expires: futureDate,
        refreshExpires: futureDate,
      });
    });
    it('requires a token', async function () {
      manager.mysteryBox.unpack.rejects();
      await assert.rejects(() => manager._refreshToken(dbCtx, req, res, ctx), ResponseError);
    });
    it('requires token to have refresh field', async function () {
      manager.mysteryBox.unpack.resolves();
      await assert.rejects(() => manager._refreshToken(dbCtx, req, res, ctx), ResponseError);
    });
    it('requires token to exist in db', async function () {
      manager.db.tokenGetByCodeId.resolves();
      await assert.rejects(() => manager._refreshToken(dbCtx, req, res, ctx), ResponseError);
    });
    it('requires token be refreshable', async function () {
      manager.db.tokenGetByCodeId.resolves({
        refreshExpires: undefined,
      });
      await assert.rejects(() => manager._refreshToken(dbCtx, req, res, ctx), ResponseError);
    });
    it('requires refresh of token not be expired', async function () {
      manager.db.tokenGetByCodeId.resolves({
        refreshExpires: 1000,
      });
      await assert.rejects(() => manager._refreshToken(dbCtx, req, res, ctx), ResponseError);
    });
    it('requires token not to have been already refreshed', async function () {
      const nowEpoch = Math.ceil(Date.now() / 1000);
      manager.mysteryBox.unpack.resolves({
        rc: '03bb8ab0-1dc7-11ed-99f2-0025905f714a',
        ts: nowEpoch - 864000,
        exp: nowEpoch - 86400,
      });
      await assert.rejects(() => manager._refreshToken(dbCtx, req, res, ctx), ResponseError);
    });
    it('requires client_id requesting refresh match', async function () {
      ctx.parsedBody['client_id'] = 'https://wrong.example.com/';
      await assert.rejects(() => manager._refreshToken(dbCtx, req, res, ctx), ResponseError);
    });
    it('succeeds', async function () {
      await manager._refreshToken(dbCtx, req, res, ctx);
      assert(res.end.called);
    });
    it('covers non-expiring', async function () {
      manager.db.tokenGetByCodeId.resolves({
        refreshExpires: new Date(Date.now() + 86400000),
        duration: 86400,
        clientId: 'https://client.example.com/',
        scopes: ['profile', 'create'],
      });
      await manager._refreshToken(dbCtx, req, res, ctx);
      assert(res.end.called);
    });
    it('covers profile and email', async function () {
      manager.db.tokenGetByCodeId.resolves({
        refreshExpires: new Date(Date.now() + 86400000),
        duration: 86400,
        clientId: 'https://client.example.com/',
        scopes: ['profile', 'email', 'create'],
      });
      await manager._refreshToken(dbCtx, req, res, ctx);
      assert(res.end.called);
    });
    it('succeeds with scope reduction', async function () {
      ctx.parsedBody['scope'] = 'profile fancy';
      manager.db.tokenGetByCodeId.resolves({
        refreshExpires: new Date(Date.now() + 86400000),
        clientId: 'https://client.example.com/',
        scopes: ['profile', 'create'],
      });
      await manager._refreshToken(dbCtx, req, res, ctx);
      assert(res.end.called);
    });
    it('covers refresh failed', async function () {
      manager.db.refreshCode.resolves();
      await assert.rejects(() => manager._refreshToken(dbCtx, req, res, ctx), ResponseError);
    });
  }); // _refreshToken

  describe('_mintTicket', function () {
    let dbCtx, payload;
    beforeEach(function () {
      dbCtx = {};
      payload = {
        subject: 'https://third-party.example.com/',
        resource: 'https://private.example.com/feed',
        scopes: ['read'],
        identifier: 'account',
        profile: 'https://profile.example.com/',
        ticketLifespanSeconds: 86400,
      };
    });
    it('covers', async function () {
      const expected = 'xxx';
      sinon.stub(manager.mysteryBox, 'pack').resolves(expected);
      const result = await manager._mintTicket(dbCtx, payload);
      assert.strictEqual(result, expected);
    });
  }); // _mintTicket

  describe('_ticketAuthToken', function () {
    let dbCtx, ticketPayload, nowEpoch;
    beforeEach(function () {
      dbCtx = {};
      nowEpoch = Math.ceil(Date.now() / 1000);
      ticketPayload = {
        c: '5ec17f78-5576-11ed-b444-0025905f714a',
        iss: nowEpoch - 86400,
        exp: nowEpoch + 86400,
        sub: 'https://third-party.example.com/',
        res: 'https://private.example.com/feed',
        scope: ['read', 'flap'],
        ident: 'account',
        profile: 'https://profile.example.com/',
      };
      sinon.stub(manager.mysteryBox, 'unpack').resolves(ticketPayload);
      sinon.stub(manager.mysteryBox, 'pack').resolves('ticket');
    });
    it('covers invalid ticket', async function () {
      manager.mysteryBox.unpack.resolves();
      await assert.rejects(() => manager._ticketAuthToken(dbCtx, req, res, ctx), ResponseError);
    });
    it('covers expired ticket', async function () {
      manager.mysteryBox.unpack.resolves({
        c: '5ec17f78-5576-11ed-b444-0025905f714a',
        iss: nowEpoch - 172800,
        exp: nowEpoch - 86400,
        sub: 'https://third-party.example.com/',
        res: 'https://private.example.com/feed',
        scope: ['read', 'flap'],
        ident: 'account',
        profile: 'https://profile.example.com/',
      });
      await assert.rejects(() => manager._ticketAuthToken(dbCtx, req, res, ctx), ResponseError);
    });
    it('covers success', async function () {
      manager.db.redeemCode.resolves(true);
      await manager._ticketAuthToken(dbCtx, req, res, ctx);
      assert(res.end.called);
    });
    it('covers invalid redeem', async function () {
      manager.db.redeemCode.resolves(false);
      await assert.rejects(() => manager._ticketAuthToken(dbCtx, req, res, ctx), ResponseError);
    });
  }); // _ticketAuthToken

  describe('postRevocation', function () {
    beforeEach(function () {
      sinon.stub(manager, '_revokeToken');
    });
    it('covers success', async function () {
      manager._revokeToken.resolves();
      await manager.postRevocation(res, ctx);
      assert(manager._revokeToken.called);
    });
    it('covers failure', async function () {
      manager._revokeToken.rejects(expectedException);
      await assert.rejects(manager.postRevocation(res, ctx));
    });
  }); // postRevocation

  describe('postUserInfo', function () {
    beforeEach(function () {
      ctx.parsedBody['token'] = 'XXX';
      sinon.stub(manager.mysteryBox, 'unpack');
    });
    it('requires a token', async function () {
      delete ctx.parsedBody.token;
      await manager.postUserInfo(res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.statusCode, 400);
    });
    it('requires a valid token', async function () {
      manager.mysteryBox.unpack.rejects(expectedException);
      await manager.postUserInfo(res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.statusCode, 401);
    });
    it('requires token to have profile scope', async function () {
      manager.mysteryBox.unpack.resolves({});
      manager.db.tokenGetByCodeId.resolves({
        scopes: [],
      });
      await manager.postUserInfo(res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.statusCode, 403);
    });
    it('succeeds', async function () {
      manager.mysteryBox.unpack.resolves({});
      manager.db.tokenGetByCodeId.resolves({
        scopes: ['profile', 'email'],
        profile: {
          url: 'https://example.com/',
          email: 'user@example.com',
        },
      });
      await manager.postUserInfo(res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.statusCode, 200);
    });
    it('succeeds, and does not include email without scope', async function () {
      manager.mysteryBox.unpack.resolves({});
      manager.db.tokenGetByCodeId.resolves({
        scopes: ['profile'],
        profile: {
          url: 'https://example.com/',
          email: 'user@example.com',
        },
      });
      await manager.postUserInfo(res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.statusCode, 200);
      const response = JSON.parse(res.end.args[0][0]);
      assert(!('email' in response));
    });
  }); // postUserInfo

  describe('getAdmin', function () {
    beforeEach(function () {
      manager.db.profilesScopesByIdentifier.resolves({
        profileScopes: {
          'https://profile.example.com/': {
            'scope': {
              'scope1': {
                description: 'a scope',
                profiles: ['https://profile.example.com/'],
              },
            },
          },
        },
        scopeIndex: {
          'scope1': {
            description: 'a scope',
            profiles: ['https://profile.example.com/'],
          },
        },
        profiles: ['https://profile.example.com/'],
      });
      manager.db.tokensGetByIdentifier.resolves();
    });
    it('covers', async function () {
      await manager.getAdmin(res, ctx);
    });
  }); // getAdmin

  describe('postAdmin', function () {
    beforeEach(function () {
      manager.db.profilesScopesByIdentifier.resolves({
        profileScopes: {
          'https://profile.example.com/': {
            'scope': {
              'scope1': {
                description: 'a scope',
                profiles: ['https://profile.example.com/'],
              },
            },
          },
        },
        scopeIndex: {
          'scope1': {
            description: 'a scope',
            profiles: ['https://profile.example.com/'],
          },
        },
        profiles: ['https://profile.example.com/'],
      });
      manager.db.tokensGetByIdentifier.resolves([]);
      manager.db.tokenRevokeByCodeId.resolves();
      manager.db.profileIdentifierInsert.resolves();
      manager.db.profileScopesSetAll.resolves();
      manager.communication.fetchProfile.resolves({
        metadata: {
          authorizationEndpoint: manager.selfAuthorizationEndpoint,
        },
      });
    });
    describe('save-scopes action', function () {
      beforeEach(function () {
        ctx.parsedBody['action'] = 'save-scopes';
        ctx.parsedBody['scopes-https://profile/example.com/'] = ['scope1', 'scope2'];
      });
      it('covers saving scopes', async function () {
        await manager.postAdmin(res, ctx);
        assert(ctx.notifications.length);
        assert(manager.db.profileScopesSetAll.called);
      });
      it('covers saving scopes error', async function () {
        manager.db.profileScopesSetAll.rejects();
        await manager.postAdmin(res, ctx);
        assert(ctx.errors.length);
      });
    }); // save-scopes action
    describe('new-profile action', function () {
      beforeEach(function () {
        ctx.parsedBody['action'] = 'new-profile';
      });
      it('covers new profile', async function () {
        ctx.parsedBody['profile'] = 'https://profile.example.com/';
        await manager.postAdmin(res, ctx);
        assert(ctx.notifications.length);
        assert(manager.db.profileIdentifierInsert.called);
        assert(manager.db.profileScopesSetAll.called);
      });
      it('covers invalid profile', async function () {
        ctx.parsedBody['action'] = 'new-profile';
        ctx.parsedBody['profile'] = 'not a url';
        await manager.postAdmin(res, ctx);
        assert(ctx.errors.length);
      });
      it('covers other validation failure', async function () {
        sinon.stub(manager.communication, 'validateProfile').rejects(expectedException);
        ctx.parsedBody['action'] = 'new-profile';
        ctx.parsedBody['profile'] = 'not a url';
        await manager.postAdmin(res, ctx);
        assert(ctx.errors.length);
      });
      it('covers mismatched profile', async function () {
        ctx.parsedBody['action'] = 'new-profile';
        ctx.parsedBody['profile'] = 'https://profile.example.com/';
        manager.communication.fetchProfile.resolves({
          metadata: {
            authorizationEndpoint: 'https://other.example.com/auth',
          },
        });
        await manager.postAdmin(res, ctx);
        assert(ctx.errors.length);
      });
      it('covers new profile error', async function () {
        ctx.parsedBody['action'] = 'new-profile';
        ctx.parsedBody['profile'] = 'https://profile.example.com/';
        manager.db.profileIdentifierInsert.rejects();
        await manager.postAdmin(res, ctx);
        assert(ctx.errors.length);
      });
    }); // new-profile action
    describe('new-scope action', function () {
      beforeEach(function () {
        ctx.parsedBody['action'] = 'new-scope';
      });
      it('covers new scope', async function () {
        ctx.parsedBody['scope'] = 'newscope';
        await manager.postAdmin(res, ctx);
        assert(ctx.notifications.length);
        assert(manager.db.scopeUpsert.called);
      });
      it('covers bad scope', async function () {
        ctx.parsedBody['scope'] = 'bad scope';
        await manager.postAdmin(res, ctx);
        assert(ctx.errors.length);
      });
      it('covers new scope error', async function () {
        ctx.parsedBody['scope'] = 'newscope';
        manager.db.scopeUpsert.rejects();
        await manager.postAdmin(res, ctx);
        assert(ctx.errors.length);
      });
      it('covers empty scope', async function () {
        delete ctx.parsedBody.scope;
        await manager.postAdmin(res, ctx);
        assert(!ctx.errors.length);
      });
    }); // new-scope action
    describe('delete-scope-* action', function () {
      beforeEach(function () {
        ctx.parsedBody['action'] = 'delete-scope-food%3Ayum';
      });
      it('covers delete', async function () {
        manager.db.scopeDelete.resolves(true);
        await manager.postAdmin(res, ctx);
        assert(ctx.notifications.length);
        assert(manager.db.scopeDelete.called);
      });
      it('covers no delete', async function () {
        manager.db.scopeDelete.resolves(false);
        await manager.postAdmin(res, ctx);
        assert(ctx.notifications.length);
        assert(manager.db.scopeDelete.called);
      });
      it('covers delete error', async function () {
        manager.db.scopeDelete.rejects();
        await manager.postAdmin(res, ctx);
        assert(ctx.errors.length);
        assert(manager.db.scopeDelete.called);
      });
      it('ignores empty scope', async function () {
        ctx.parsedBody['action'] = 'delete-scope-';
        await manager.postAdmin(res, ctx);
        assert(manager.db.scopeDelete.notCalled);
        assert(!ctx.notifications.length);
        assert(!ctx.errors.length);
      });
    }); // delete-scope-* action
    describe('revoke-* action', function () {
      beforeEach(function () {
        ctx.parsedBody['action'] = 'revoke-b1591c00-9cb7-11ec-a05c-0025905f714a';
      });
      it('covers revocation', async function () {
        await manager.postAdmin(res, ctx);
        assert(ctx.notifications.length);
        assert(manager.db.tokenRevokeByCodeId.called);
      });
      it('covers revocation error', async function () {
        manager.db.tokenRevokeByCodeId.rejects();
        await manager.postAdmin(res, ctx);
        assert(ctx.errors.length);
      });
      it('covers no code', async function () {
        ctx.parsedBody['action'] = 'revoke-';
        await manager.postAdmin(res, ctx);
        assert(!ctx.notifications.length);
        assert(!ctx.errors.length);
        assert(manager.db.tokenRevokeByCodeId.notCalled);
      });
    }); // revoke-* action
    it('covers empty action', async function () {
      delete ctx.parsedBody.action;
      await manager.postAdmin(res, ctx);
      assert(!ctx.errors.length);
    });
    it('covers unknown action', async function () {
      ctx.parsedBody['action'] = 'unsupported-action';
      await manager.postAdmin(res, ctx);
      assert(ctx.errors.length);
    });
  }); // postAdmin

  describe('getAdminTicket', function () {
    it('covers', async function () {
      manager.db.profilesScopesByIdentifier.resolves({ scopeIndex: {} });
      await manager.getAdminTicket(res, ctx);
      assert(res.end.called);
    });
  }); // getAdminTicket

  describe('postAdminTicket', function () {
    beforeEach(function () {
      ctx.parsedBody['action'] = 'proffer-ticket';
      ctx.parsedBody['scopes'] = ['read', 'role:private'];
      ctx.parsedBody['adhoc'] = 'adhoc_scope';
      ctx.parsedBody['profile'] = 'https://profile.example.com/';
      ctx.parsedBody['resource'] = 'https://profile.example.com/feed';
      ctx.parsedBody['subject'] = 'https://subject.example.com/';
      manager.db.profilesScopesByIdentifier.resolves({ scopeIndex: {} });
      sinon.stub(manager.mysteryBox, 'pack').resolves('ticket');
      manager.communication.fetchProfile.resolves({
        metadata: {
          ticketEndpoint: 'https://example.com/ticket',
        },
      });
    });
    it('covers success', async function () {
      await manager.postAdminTicket(res, ctx);
      assert(res.end.called);
      assert.strictEqual(ctx.errors.length, 0);
      assert.strictEqual(ctx.notifications.length, 1);
    });
    it('requires params', async function () {
      delete ctx.parsedBody['adhoc'];
      ctx.parsedBody['profile'] = 'bad url';
      ctx.parsedBody['resource'] = 'bad url';
      ctx.parsedBody['subject'] = 'bad url';
      ctx.parsedBody['scopes'] = ['fl"hrgl', 'email'];
      await manager.postAdminTicket(res, ctx);
      assert(res.end.called);
      assert.strictEqual(ctx.errors.length, 5);
      assert.strictEqual(ctx.notifications.length, 0);
    });
    it('ignores unknown action', async function () {
      ctx.parsedBody['action'] = 'prove-dough';
      await manager.postAdminTicket(res, ctx);
      assert(res.end.called);
    });
    it('covers delivery failure', async function () {
      manager.communication.deliverTicket.rejects(expectedException);
      await manager.postAdminTicket(res, ctx);
      assert(res.end.called);
      assert.strictEqual(ctx.errors.length, 1);
      assert.strictEqual(ctx.notifications.length, 0);
    });
    it('covers no ticket endpoint', async function () {
      manager.communication.fetchProfile.resolves({
        metadata: {
        },
      });
      await manager.postAdminTicket(res, ctx);
      assert(res.end.called);
      assert.strictEqual(ctx.errors.length, 1);
      assert.strictEqual(ctx.notifications.length, 0);
    });
    it('covers bad ticket endpoint', async function () {
      manager.communication.fetchProfile.resolves({
        metadata: {
          ticketEndpoint: 'not a url',
        },
      });
      await manager.postAdminTicket(res, ctx);
      assert(res.end.called);
      assert.strictEqual(ctx.errors.length, 1);
      assert.strictEqual(ctx.notifications.length, 0);
    });
  }); // postAdminTicket

  describe('postTicket', function () {
    beforeEach(function () {
      ctx.parsedBody = {
        ticket: 'ticket123',
        resource: 'https://blog.example.com/',
        subject: 'https://otheruser.example.com/',
      };
    });
    it('accepts a ticket for a known profile', async function () {
      manager.db.profileIsValid.resolves(true);
      await manager.postTicket(req, res, ctx);
      assert(res.end.called);
      assert.strictEqual(res.statusCode, 202);
    });
    it('rejects invalid resource', async function () {
      ctx.parsedBody.resource = 'invalid url';
      await assert.rejects(() => manager.postTicket(req, res, ctx), ResponseError);
    });
    it('rejects invalid subject', async function () {
      manager.db.profileIsValid(false);
      await assert.rejects(() => manager.postTicket(req, res, ctx), ResponseError);
    });
    it('covers queue publish failure', async function () {
      manager.db.profileIsValid.resolves(true);
      manager.queuePublisher.publish.rejects(expectedException);
      await assert.rejects(() => manager.postTicket(req, res, ctx), expectedException);
    });
    it('covers no ticket queue', async function () {
      delete options.queues.amqp.url;
      manager = new Manager(logger, stubDb, options);

      await assert.rejects(() => manager.postTicket(req, res, ctx), ResponseError);
    });

  }); // postTicket

  describe('getAdminMaintenance', function () {
    it('covers information', async function () {
      await manager.getAdminMaintenance(res, ctx);
      assert(res.end.called);
    });
    it('covers tasks', async function () {
      ctx.queryParams = {
        [Enum.Chore.CleanTokens]: '',
      };
      await manager.getAdminMaintenance(res, ctx);
      assert(res.end.called);
    });
  }); // getAdminMaintenance

}); // Manager