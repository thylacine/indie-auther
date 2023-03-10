/* eslint-env mocha */
/* eslint-disable capitalized-comments */

'use strict';

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line node/no-unpublished-require

const stubDb = require('../stub-db');
const stubLogger = require('../stub-logger');
const Service = require('../../src/service');
const Config = require('../../config');


describe('Service', function () {
  let service, options;
  let req, res, ctx;

  beforeEach(function () {
    options = new Config('test');
    service = new Service(stubLogger, stubDb, options);
    sinon.stub(service.manager);
    sinon.stub(service.sessionManager);
    sinon.stub(service.authenticator);
    sinon.stub(service.resourceAuthenticator);
    sinon.stub(service, 'setResponseType');
    sinon.stub(service, 'serveFile');
    sinon.stub(service, 'ingestBody').resolves();
    req = {
      getHeader: sinon.stub(),
    };
    res = {
      setHeader: sinon.stub(),
      write: sinon.stub(),
      end: sinon.stub(),
    };
    ctx = {
      params: {},
    };
  });

  afterEach(function () {
    sinon.restore();
  });

  it('instantiates', function () {
    assert(service);
  });

  it('instantiates with config coverage', async function () {
    options.dingus.selfBaseUrl = 'https://example.com/';
    service = new Service(stubLogger, stubDb, options);
    assert(service);
  });

  it('instantiates with config coverage', async function () {
    delete options.dingus.selfBaseUrl;
    service = new Service(stubLogger, stubDb, options);
    assert(service);
  });

  describe('initialize', function () {
    it('covers', async function () {
      await service.initialize();
      assert(service.manager.initialize.called);
    });
  }); // initialize

  describe('preHandler', function () {
    it('persists url into context', async function () {
      req.url = 'https://example.com/foo';
      sinon.stub(service.__proto__.__proto__, 'preHandler').resolves();
      await service.preHandler(req, res, ctx);
      assert.strictEqual(ctx.url, req.url);
    });
  }); // preHandler

  describe('handlerGetAdminLogin', function () {
    it('covers', async function () {
      await service.handlerGetAdminLogin(req, res, ctx);
      assert(service.sessionManager.getAdminLogin.called);
    });
  }); // handlerGetAdminLogin

  describe('handlerPostAdminLogin', function () {
    it('covers', async function () {
      await service.handlerPostAdminLogin(req, res, ctx);
      assert(service.sessionManager.postAdminLogin.called);
    });
  }); // handlerPostAdminLogin

  describe('handlerGetAdminLogout', function () {
    it('covers', async function () {
      await service.handlerGetAdminLogout(req, res, ctx);
      assert(service.sessionManager.getAdminLogout.called);
    });
  }); // handlerGetAdminLogout

  describe('handlerGetAdmin', function () {
    it('covers authenticated', async function () {
      service.authenticator.sessionRequiredLocal.resolves(true);
      await service.handlerGetAdmin(req, res, ctx);
      assert(service.manager.getAdmin.called);
    });
    it('covers unauthenticated', async function () {
      service.authenticator.sessionRequiredLocal.resolves(false);
      await service.handlerGetAdmin(req, res, ctx);
      assert(service.manager.getAdmin.notCalled);
    });
  }); // handlerGetAdmin

  describe('handlerPostAdmin', function () {
    it('covers authenticated', async function () {
      service.authenticator.sessionRequiredLocal.resolves(true);
      await service.handlerPostAdmin(req, res, ctx);
      assert(service.manager.postAdmin.called);
    });
    it('covers unauthenticated', async function () {
      service.authenticator.sessionRequiredLocal.resolves(false);
      await service.handlerPostAdmin(req, res, ctx);
      assert(service.manager.getAdmin.notCalled);
    });
  }); // handlerPostAdmin

  describe('handlerGetRoot', function () {
    it('covers', async function () {
      await service.handlerGetRoot(req, res, ctx);
      assert(service.manager.getRoot.called);
    });
  }); // handlerGetRoot

  describe('handlerGetAdminTicket', function () {
    it('covers authenticated', async function () {
      service.authenticator.sessionRequiredLocal.resolves(true);
      await service.handlerGetAdminTicket(req, res, ctx);
      assert(service.manager.getAdminTicket.called);
    });
    it('covers unauthenticated', async function () {
      service.authenticator.sessionRequiredLocal.resolves(false);
      await service.handlerGetAdminTicket(req, res, ctx);
      assert(service.manager.getAdminTicket.notCalled);
    });
  }); // handlerGetAdminTicket

  describe('handlerPostAdminTicket', function () {
    it('covers authenticated', async function () {
      service.authenticator.sessionRequiredLocal.resolves(true);
      await service.handlerPostAdminTicket(req, res, ctx);
      assert(service.manager.postAdminTicket.called);
    });
    it('covers unauthenticated', async function () {
      service.authenticator.sessionRequiredLocal.resolves(false);
      await service.handlerPostAdminTicket(req, res, ctx);
      assert(service.manager.postAdminTicket.notCalled);
    });
  }); // handlerPostAdminTicket

  describe('handlerGetMeta', function () {
    it('covers', async function () {
      await service.handlerGetMeta(req, res, ctx);
      assert(service.manager.getMeta.called);
    });
  }); // handlerGetMeta

  describe('handlerGetHealthcheck', function () {
    it('covers', async function () {
      await service.handlerGetHealthcheck(req, res, ctx);
      assert(service.manager.getHealthcheck.called);
    });
    it('cover errors', async function () {
      const expectedException = 'blah';
      service.manager.getHealthcheck.rejects(expectedException);
      try {
        await service.handlerGetHealthcheck(req, res, ctx);
        assert.fail('did not get expected exception');
      } catch (e) {
        assert.strictEqual(e.name, expectedException, 'did not get expected exception');
      }
      assert(service.manager.getHealthcheck.called);
    });
  }); // handlerGetHealthcheck

  describe('handlerInternalServerError', function () {
    it('covers no redirect', async function () {
      sinon.stub(service.__proto__.__proto__, 'handlerInternalServerError');
      await service.handlerInternalServerError(req, res, ctx);
      assert(service.__proto__.__proto__.handlerInternalServerError.called);
    });
    it('covers redirect', async function () {
      sinon.stub(service.__proto__.__proto__, 'handlerInternalServerError');
      ctx.session = {
        redirectUri: new URL('https://client.example.com/app'),
        clientIdentifier: new URL('https://client.exmaple.com/'),
        state: '123456',
      };
      await service.handlerInternalServerError(req, res, ctx);
      assert(!service.__proto__.__proto__.handlerInternalServerError.called);
      assert(res.setHeader);
    });
  }); // handlerInternalServerError

  describe('handlerGetAuthorization', function () {
    it('covers authenticated', async function() {
      service.authenticator.sessionRequiredLocal.resolves(true);
      await service.handlerGetAuthorization(req, res, ctx);
      assert(service.manager.getAuthorization.called);
    });
    it('covers unauthenticated', async function() {
      service.authenticator.sessionRequiredLocal.resolves(false);
      await service.handlerGetAuthorization(req, res, ctx);
      assert(service.manager.getAuthorization.notCalled);
    });
  }); // handlerGetAuthorization

  describe('handlerPostAuthorization', function () {
    it('covers', async function () {
      await service.handlerPostAuthorization(req, res, ctx);
      assert(service.manager.postAuthorization.called);
    });
  }); // handlerPostAuthorization

  describe('handlerPostConsent', function () {
    it('covers', async function () {
      service.serveFile.resolves();
      await service.handlerPostConsent(req, res, ctx);
      assert(service.manager.postConsent.called);
    });
  }); // handlerPostConsent

  describe('handlerPostToken', function () {
    it('covers', async function () {
      await service.handlerPostToken(req, res, ctx);
      assert(service.manager.postToken.called);
    });
  }); // handlerPostToken

  describe('handlerPostTicket', function () {
    it('covers', async function () {
      await service.handlerPostTicket(req, res, ctx);
      assert(service.manager.postTicket.called);
    });
  }); // handlerPostTicket

  describe('handlerPostIntrospection', function () {
    it('covers', async function () {
      await service.handlerPostIntrospection(req, res, ctx);
      assert(service.manager.postIntrospection.called);
    });
  }); // handlerPostIntrospection

  describe('handlerPostRevocation', function () {
    it('covers', async function () {
      await service.handlerPostRevocation(req, res, ctx);
      assert(service.manager.postRevocation.called);
    });
  }); // handlerPostRevocation

  describe('handlerPostUserInfo', function () {
    it('covers', async function () {
      await service.handlerPostUserInfo(req, res, ctx);
      assert(service.manager.postUserInfo.called);
    });
  }); // handlerPostUserInfo

  describe('handlerGetAdminMaintenance', function () {
    it('covers authenticated', async function () {
      service.authenticator.sessionRequiredLocal.resolves(true);
      await service.handlerGetAdminMaintenance(req, res, ctx);
      assert(service.manager.getAdminMaintenance.called);
    });
    it('covers unauthenticated', async function () {
      service.authenticator.sessionRequiredLocal.resolves(false);
      await service.handlerGetAdminMaintenance(req, res, ctx);
      assert(service.manager.getAdminMaintenance.notCalled);
    });
  }); // handlerGetAdminMaintenance

});