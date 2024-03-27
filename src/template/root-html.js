'use strict';

const th = require('./template-helper');
const { sessionNavLinks } = require('@squeep/authentication-module');

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
 * @param {Object} ctx
 * @param {Object} options
 * @param {Object} options.manager
 * @param {String} options.manager.pageTitle
 * @param {String[]} options.manager.footerEntries
 * @param {String} options.adminContactHTML
 * @returns {String}
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