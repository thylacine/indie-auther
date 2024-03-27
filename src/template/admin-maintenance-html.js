'use strict';

const th = require('./template-helper');
const { sessionNavLinks } = require('@squeep/authentication-module');

function renderAlmanacRow(entry) {
  const { event, date } = entry;
  return `<tr>
\t<td>${event}</td>
\t<td>${th.timeElement(date, { title: 'Occurred' })}</td>
</tr>`;
}

function almanacSection(almanac) {
  return `<section>
\t<h2>Almanac</h2>
\t<table>
\t\t<thead>
\t\t\t<th>Event</th>
\t\t\t<th>Date</th>
\t\t</thead>
\t\t<tbody>
${almanac.map((entry) => renderAlmanacRow(entry)).join('\n')}
\t\t</tbody>
\t<table>
</section>`;
}

function renderChoreRow(choreName, choreDetails) {
  const { intervalMs, nextSchedule } = choreDetails;
  return `<tr>
\t<td>${choreName}</td>
\t<td>${th.secondsToPeriod(Math.ceil(intervalMs / 1000))}</td>
\t<td>${th.timeElement(nextSchedule)}</td>
</tr>`;
}

function choresSection(chores) {
  return `<section>
\t<h2>Chores</h2>
\t<table>
\t\t<thead>
\t\t\t<th>Chore</th>
\t\t\t<th>Frequency</th>
\t\t\t<th>Next Run</th>
\t\t</thead>
\t\t<tbody>
${Object.entries(chores).map((chore) => renderChoreRow(...chore)).join('\n')}
\t\t</tbody>
\t<table>
</section>`;
}

/**
 * 
 * @param {Object} ctx
 * @param {Object[]} ctx.almanac
 * @param {Object} ctx.chores
 * @param {Object} options
 * @param {Object} options.manager
 * @param {String} options.manager.pageTitle
 * @param {String[]} options.manager.footerEntries
 * @param {String} options.adminContactHTML
 * @returns {String}
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