'use strict';

const th = require('./template-helper');
const { sessionNavLinks } = require('@squeep/authentication-module');

/**
 * 
 * @param {object} ctx context
 * @param {object} ctx.session session
 * @param {string=} ctx.session.error errors
 * @param {string[]=} ctx.session.errorDescriptions errors
 * @param {object} options options
 * @param {object} options.manager manager options
 * @param {string} options.manager.pageTitle page title
 * @param {string} options.manager.footerEntries footer entries
 * @returns {string} page
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