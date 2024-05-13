'use strict';

const th = require('./template-helper');
const { sessionNavLinks } = require('@squeep/authentication-module');

/**
 *
 * @param {object} entry entry
 * @returns {string} tr
 */
function renderAlmanacRow(entry) {
  const { event, date } = entry;
  return `<tr>
\t<td>${event}</td>
\t<td>${th.timeElement(date, { title: 'Occurred' })}</td>
</tr>`;
}

/**
 *
 * @param {object[]} almanac entries
 * @returns {string} section
 */
function almanacSection(almanac) {
  return `<section>
\t<h2>Almanac</h2>
\t<table>
\t\t<thead>
\t\t\t\t<tr>
\t\t\t\t<th scope="col">Event</th>
\t\t\t\t<th scope="col">Date</th>
\t\t\t</tr>
\t\t</thead>
\t\t<tbody>
${almanac.map((entry) => renderAlmanacRow(entry)).join('\n')}
\t\t</tbody>
\t</table>
</section>`;
}

/**
 *
 * @param {string} choreName name
 * @param {object} choreDetails details
 * @returns {string} tr
 */
function renderChoreRow(choreName, choreDetails) {
  const { intervalMs, nextSchedule } = choreDetails;
  return `<tr>
\t<td>${choreName}</td>
\t<td>${th.secondsToPeriod(Math.ceil(intervalMs / 1000))}</td>
\t<td>${th.timeElement(nextSchedule)}</td>
</tr>`;
}

/**
 *
 * @param {object} chores chores
 * @returns {string} section
 */
function choresSection(chores) {
  return `<section>
\t<h2>Chores</h2>
\t<table>
\t\t<thead>
\t\t\t<tr>
\t\t\t\t<th scope="col">Chore</th>
\t\t\t\t<th scope="col">Frequency</th>
\t\t\t\t<th scope="col">Next Run</th>
\t\t\t</tr>
\t\t</thead>
\t\t<tbody>
${Object.entries(chores).map((chore) => renderChoreRow(...chore)).join('\n')}
\t\t</tbody>
\t</table>
</section>`;
}

/**
 * 
 * @param {object} ctx context
 * @param {object[]} ctx.almanac entries
 * @param {object} ctx.chores chores
 * @param {object} options options
 * @param {object} options.manager manager options
 * @param {string} options.manager.pageTitle page title
 * @param {string[]} options.manager.footerEntries footer entires
 * @returns {string} page
 */
module.exports = (ctx, options) => {
  const pagePathLevel = 1;
  const htmlOptions = {
    pageIdentifier: 'maintenance',
    pageTitle: options.manager.pageTitle + ' - Maintenance',
    logoUrl: options.manager.logoUrl,
    footerEntries: options.manager.footerEntries,
  };
  th.navLinks(pagePathLevel, ctx, htmlOptions);
  sessionNavLinks(pagePathLevel, ctx, htmlOptions);
  const content = [
    almanacSection(ctx.almanac || []),
    choresSection(ctx.chores || {}),
  ];
  return th.htmlPage(pagePathLevel, ctx, htmlOptions, content);
};