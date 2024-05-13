'use strict';

const th = require('./template-helper');
const { sessionNavLinks } = require('@squeep/authentication-module');

/**
 * @returns {string} section
 */
function aboutSection() {
  return `
      <section class="about">
        <h2>What</h2>
        <p>
          This is an <a class="external" href="https://indieweb.org/IndieAuth">IndieAuth</a> service.
        </p>
        <p>
          It facilitates distributed authentication.
        </p>
        <p>
          If you are not an established user of this service, or some sort of web application, there is very little here for you.
        </p>
      </section>`;
}

/**
 * @param {string} contactHTML content
 * @returns {string} section
 */
function contactSection(contactHTML) {
  let section = '';
  if (contactHTML) {
    section = `      <section>
${contactHTML}
      </section>`;
  }
  return section;
}

/**
 * 
 * @param {object} ctx context
 * @param {object} options options
 * @param {object} options.manager manager options
 * @param {string} options.manager.pageTitle page title
 * @param {string[]} options.manager.footerEntries footer entries
 * @param {string=} options.adminContactHTML content
 * @returns {string} page
 */
module.exports = (ctx, options) => {
  const pagePathLevel = 0;
  const contactHTML = options.adminContactHTML;
  const htmlOptions = {
    pageIdentifier: 'root',
    pageTitle: options.manager.pageTitle,
    logoUrl: options.manager.logoUrl,
    footerEntries: options.manager.footerEntries,
    headElements: [
      `<link rel="indieauth-metadata" href="${options.dingus.selfBaseUrl}${options.route.metadata}">`,
    ],
  };
  th.navLinks(pagePathLevel, ctx, htmlOptions);
  sessionNavLinks(pagePathLevel, ctx, htmlOptions);
  const content = [
    aboutSection(),
    contactSection(contactHTML),
  ];
  return th.htmlPage(pagePathLevel, ctx, htmlOptions, content);
};