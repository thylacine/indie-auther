'use strict';

const { TemplateHelper } = require('@squeep/html-template-helper');


/**
 * Escape a string to be suitable as a CSS name.
 * @param {String} unsafeName 
 * @returns {String}
 */
function escapeCSS(unsafeName) {
  return unsafeName.replace(/([^0-9a-zA-Z-])/g, '\\$1');
}


/**
 * Given a pair of Array tuples containing scope names and scope details,
 * return the comparison between the two, for sorting.
 * Scopes are sorted such that they are grouped by application, then name.
 * Empty applications are sorted ahead of extant applications.
 * @param {Array} a
 * @param {Array} b
 * @returns {Number}
 */
function scopeCompare([aScope, aDetails], [bScope, bDetails]) {
  const { application: aApp } = aDetails;
  const { application: bApp } = bDetails;
  if ((aApp || bApp) && (aApp !== bApp)) {
    if (!aApp) {
      return -1;
    }
    if (!bApp) {
      return 1;
    }
    if (aApp > bApp) {
      return 1;
    }
    return -1;
  }

  if (aScope > bScope) {
    return 1;
  } else if (aScope < bScope) {
    return -1;
  }
  return 0;
}


/**
 * Populate common navLinks for page templates.
 * @param {Number} pagePathLevel
 * @param {Object} ctx 
 * @param {Object} options 
 */
function navLinks(pagePathLevel, ctx, options) {
  if (!options.navLinks) {
    options.navLinks = [];
  }
  const rootPath = '../'.repeat(pagePathLevel);

  if (options.pageIdentifier !== 'admin') {
    options.navLinks.push({
      text: 'Admin',
      href: `${rootPath}admin/`,
    });
  }
  if (options.pageIdentifier !== 'ticketProffer') {
    options.navLinks.push({
      text: 'Ticket',
      href: `${rootPath}admin/ticket`,
    });
  }
}

module.exports = Object.assign(Object.create(TemplateHelper), {
  escapeCSS,
  scopeCompare,
  navLinks,
});