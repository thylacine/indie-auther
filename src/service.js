'use strict';

/**
 * Here we extend the base API server to define our routes and any route-specific
 * behavior (middlewares) before handing off to the manager.
 */

const path = require('path');
const { Dingus } = require('@squeep/api-dingus');
const common = require('./common');
const Manager = require('./manager');
const { Authenticator, SessionManager } = require('@squeep/authentication-module');
const { ResourceAuthenticator } = require('@squeep/resource-authentication-module');
const { TemplateHelper: { initContext } } = require('@squeep/html-template-helper');
const Enum = require('./enum');

const _fileScope = common.fileScope(__filename);

class Service extends Dingus {
  constructor(logger, db, options) {
    super(logger, {
      ...options.dingus,
      ignoreTrailingSlash: false,
    });

    this.staticPath = path.normalize(path.join(__dirname, '..', 'static'));
    this.manager = new Manager(logger, db, options);
    this.authenticator = new Authenticator(logger, db, options);
    this.sessionManager = new SessionManager(logger, this.authenticator, options);
    this.resourceAuthenticator = new ResourceAuthenticator(logger, db, options);
    this.loginPath = `${options.dingus.proxyPrefix}/admin/login`;

    // N.B. /admin routes not currently configurable
    const route = (r) => `/${options.route[r]}`; // eslint-disable-line security/detect-object-injection

    // Service discovery
    this.on(['GET', 'HEAD'], route('metadata'), this.handlerGetMeta.bind(this));
    // Also respond with metadata on well-known oauth2 endpoint if base has no prefix
    if ((options?.dingus?.selfBaseUrl?.match(/\//g) || []).length === 3) {
      this.on(['GET', 'HEAD'], '/.well-known/oauth-authorization-server', this.handlerGetMeta.bind(this));
    }

    // Primary endpoints
    this.on(['GET'], route('authorization'), this.handlerGetAuthorization.bind(this));
    this.on(['POST'], route('authorization'), this.handlerPostAuthorization.bind(this));
    this.on(['POST'], route('consent'), this.handlerPostConsent.bind(this));
    this.on(['POST'], route('revocation'), this.handlerPostRevocation.bind(this));
    this.on(['POST'], route('ticket'), this.handlerPostTicket.bind(this));
    this.on(['POST'], route('token'), this.handlerPostToken.bind(this));

    // Resource endpoints
    this.on('POST', route('introspection'), this.handlerPostIntrospection.bind(this));
    this.on('POST', route('userinfo'), this.handlerPostUserInfo.bind(this));

    // Information page about service
    this.on(['GET', 'HEAD'], '/', this.handlerGetRoot.bind(this));

    // Give load-balancers something to check
    this.on(['GET', 'HEAD'], route('healthcheck'), this.handlerGetHealthcheck.bind(this));

    // These routes are intended for accessing static content during development.
    // In production, a proxy server would likely handle these first.
    this.on(['GET', 'HEAD'], '/static', this.handlerRedirect.bind(this), `${options.dingus.proxyPrefix}/static/`);
    this.on(['GET', 'HEAD'], '/static/', this.handlerGetStaticFile.bind(this), 'index.html');
    this.on(['GET', 'HEAD'], '/static/:file', this.handlerGetStaticFile.bind(this));
    this.on(['GET', 'HEAD'], '/favicon.ico', this.handlerGetStaticFile.bind(this), 'favicon.ico');
    this.on(['GET', 'HEAD'], '/robots.txt', this.handlerGetStaticFile.bind(this), 'robots.txt');

    // Profile and token management for authenticated sessions
    this.on(['GET', 'HEAD'], '/admin', this.handlerRedirect.bind(this), `${options.dingus.proxyPrefix}/admin/`);
    this.on(['GET', 'HEAD'], '/admin/', this.handlerGetAdmin.bind(this));
    this.on(['POST'], '/admin/', this.handlerPostAdmin.bind(this));

    // Ticket-proffering interface for authenticated sessions
    this.on(['GET', 'HEAD'], '/admin/ticket', this.handlerGetAdminTicket.bind(this));
    this.on(['POST'], '/admin/ticket', this.handlerPostAdminTicket.bind(this));

    // User authentication and session establishment
    this.on(['GET', 'HEAD'], '/admin/login', this.handlerGetAdminLogin.bind(this));
    this.on(['POST'], '/admin/login', this.handlerPostAdminLogin.bind(this));
    this.on(['GET'], '/admin/logout', this.handlerGetAdminLogout.bind(this));

    // Page for upkeep info et cetera
    this.on(['GET', 'HEAD'], '/admin/maintenance', this.handlerGetAdminMaintenance.bind(this));

  }


  /**
   * Perform any async startup tasks.
   */
  async initialize() {
    await this.manager.initialize();
  }


  /**
   * Do a little more on each request.
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async preHandler(req, res, ctx) {
    await super.preHandler(req, res, ctx);
    ctx.url = req.url; // Persist this for logout redirect
  }


  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerGetAdminLogin(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminLogin');
    this.logger.debug(_scope, 'called', { req, ctx });

    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.sessionManager.getAdminLogin(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerPostAdminLogin(req, res, ctx) {
    const _scope = _fileScope('handlerPostAdminLogin');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.sessionManager.postAdminLogin(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerGetAdminLogout(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminLogout');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.sessionManager.getAdminLogout(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerGetAdmin(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdmin');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx, this.loginPath)) {
      await this.manager.getAdmin(res, ctx);
    }
  }


  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerPostAdmin(req, res, ctx) {
    const _scope = _fileScope('handlerPostAdmin');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx, this.loginPath)) {
      await this.ingestBody(req, res, ctx);
      await this.manager.postAdmin(res, ctx);
    }
  }


  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerGetAdminTicket(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminTicket');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx, this.loginPath)) {
      await this.manager.getAdminTicket(res, ctx);
    }
  }


  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerPostAdminTicket(req, res, ctx) {
    const _scope = _fileScope('handlerPostAdminTicket');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx, this.loginPath)) {
      await this.ingestBody(req, res, ctx);
      await this.manager.postAdminTicket(res, ctx);
    }
  }


  /**
   * @param {http.IncomingMessage} req 
   * @param {http.ServerResponse} res 
   * @param {Object} ctx 
   */
  async handlerGetMeta(req, res, ctx) {
    const _scope = _fileScope('handlerGetMeta');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.manager.getMeta(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req 
   * @param {http.ServerResponse} res 
   * @param {Object} ctx 
   */
  async handlerGetAuthorization(req, res, ctx) {
    const _scope = _fileScope('handlerGetAuthorization');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx, this.loginPath)) {
      await this.manager.getAuthorization(res, ctx);
    }
  }


  /**
   * @param {http.IncomingMessage} req 
   * @param {http.ServerResponse} res 
   * @param {Object} ctx 
   */
  async handlerPostAuthorization(req, res, ctx) {
    const _scope = _fileScope('handlerPostAuthorization');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    this.setResponseType(responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postAuthorization(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req 
   * @param {http.ServerResponse} res 
   * @param {Object} ctx 
   */
  async handlerPostConsent(req, res, ctx) {
    const _scope = _fileScope('handlerPostConsent');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    // This isn't specified as required as any valid payload carries intrinsic auth data.
    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postConsent(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req 
   * @param {http.ServerResponse} res 
   * @param {Object} ctx 
   */
  async handlerPostTicket(req, res, ctx) {
    const _scope = _fileScope('handlerPostTicket');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    this.setResponseType(responseTypes, req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postTicket(req, res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req 
   * @param {http.ServerResponse} res 
   * @param {Object} ctx 
   */
  async handlerPostToken(req, res, ctx) {
    const _scope = _fileScope('handlerPostToken');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    this.setResponseType(responseTypes, req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postToken(req, res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req 
   * @param {http.ServerResponse} res 
   * @param {Object} ctx 
   */
  async handlerPostRevocation(req, res, ctx) {
    const _scope = _fileScope('handlerPostRevocation');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    this.setResponseType(responseTypes, req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postRevocation(req, res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req 
   * @param {http.ServerResponse} res 
   * @param {Object} ctx 
   */
  async handlerPostIntrospection(req, res, ctx) {
    const _scope = _fileScope('handlerPostIntrospection');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    await this.resourceAuthenticator.required(req, res, ctx);

    this.setResponseType(responseTypes, req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postIntrospection(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req 
   * @param {http.ServerResponse} res 
   * @param {Object} ctx 
   */
  async handlerPostUserInfo(req, res, ctx) {
    const _scope = _fileScope('handlerPostUserInfo');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [
      Enum.ContentType.ApplicationJson,
      Enum.ContentType.TextPlain,
    ];

    this.setResponseType(responseTypes, req, res, ctx);

    await this.ingestBody(req, res, ctx);

    await this.manager.postUserInfo(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req 
   * @param {http.ServerResponse} res 
   * @param {Object} ctx 
   */
  async handlerGetRoot(req, res, ctx) {
    const _scope = _fileScope('handlerGetRoot');
    const responseTypes = [
      Enum.ContentType.TextHTML,
    ];
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.manager.getRoot(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req 
   * @param {http.ServerResponse} res 
   * @param {Object} ctx 
   */
  async handlerGetHealthcheck(req, res, ctx) {
    const _scope = _fileScope('handlerGetHealthcheck');
    this.logger.debug(_scope, 'called', { req, ctx });
  
    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.manager.getHealthcheck(res, ctx);
  }


  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerGetAdminMaintenance(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminMaintenance');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx, this.loginPath)) {
      await this.manager.getAdminMaintenance(res, ctx);
    }
  }


  /**
   * FIXME: This doesn't seem to be working as envisioned. Maybe override render error method instead???
   * Intercept this and redirect if we have enough information, otherwise default to framework.
   * The redirect attempt should probably be contained in a Manager method, but here it is for now.
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerInternalServerError(req, res, ctx) {
    const _scope = _fileScope('handlerInternalServerError');
    this.logger.debug(_scope, 'called', { req, ctx });

    if (ctx?.session?.redirectUri && ctx?.session?.clientIdentifier) {
      Object.entries({
        ...(ctx.session.state && { 'state': ctx.session.state }),
        'error': 'server_error',
        'error_description': 'An internal server error occurred',
      }).forEach(([name, value]) => ctx.session.redirectUri.searchParams.set(name, value));
      res.statusCode = 302; // Found
      res.setHeader(Enum.Header.Location, ctx.session.redirectUri.href);
      res.end();
      return;
    }

    super.handlerInternalServerError(req, res, ctx);
  }


}

module.exports = Service;

