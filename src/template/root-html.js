'use strict';

const th = require('./template-helper');

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
  const contactHTML = options.adminContactHTML;
  const htmlOptions = {
    pageTitle: options.manager.pageTitle,
    logoUrl: options.manager.logoUrl,
    footerEntries: options.manager.footerEntries,
    navLinks: [
      {
        text: 'Admin',
        href: 'admin/',
      },
      {
        text: 'Ticket',
        href: 'admin/ticket',
      },
    ],
  };
  const content = [
    aboutSection(),
    contactSection(contactHTML),
  ];
  return th.htmlPage(1, ctx, htmlOptions, content);
};