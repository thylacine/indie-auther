'use strict';

const th = require('./template-helper');
const { sessionNavLinks } = require('@squeep/authentication-module');

/**
 * 
 * @param {Object} ctx
 * @param {Object} ctx.session
 * @param {String=} ctx.session.error
 * @param {String[]=} ctx.session.errorDescriptions
 * @param {Object} options
 * @param {Object} options.manager
 * @param {String} options.manager.pageTitle
 * @param {String} options.manager.footerEntries
 * @returns {String}
 */
module.exports = (ctx, options) => {
  const pagePathLevel = 0;
  const htmlOptions = {
    pageIdentifier: 'authorizationError',
    pageTitle: options.manager.pageTitle,
    logoUrl: options.manager.logoUrl,
    footerEntries: options.manager.footerEntries,
    errorContent: ctx.errorContent || ['Unknown Error'],
  };
  th.navLinks(pagePathLevel, ctx, htmlOptions);
  sessionNavLinks(pagePathLevel, ctx, htmlOptions);
  return th.htmlPage(pagePathLevel, ctx, htmlOptions, []);
};