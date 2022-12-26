'use strict';

const th = require('./template-helper');


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
  const htmlOptions = {
    pageTitle: options.manager.pageTitle,
    logoUrl: options.manager.logoUrl,
    footerEntries: options.manager.footerEntries,
    errorContent: ctx.errorContent || ['Unknown Error'],
  };
  return th.htmlPage(0, ctx, htmlOptions, []);
};