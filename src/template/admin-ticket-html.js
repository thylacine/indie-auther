'use strict';

/**
 * This renders the interface for submitting a ticket proffer to a third-party.
 */

const th = require('./template-helper');
const { sessionNavLinks } = require('@squeep/authentication-module');


/**
 *
 * @param {string} profile profile
 * @returns {string} option
 */
function renderProfileOption(profile) {
  return `<option value="${profile}">${profile}</option>`;
}

/**
 *
 * @param {string} scope scope
 * @returns {string} tr
 */
function renderScopeCheckboxTR(scope) {
  const defaultChecked = ['read'];
  const checked = defaultChecked.includes(scope) ? ' checked' : '';
  return `<tr class="scope">
\t<td><input type="checkbox" id="scopes-${scope}" name="scopes[]" value="${scope}"${checked}></td>
\t<td>${scope}</td>
</tr>`;
}

/**
 *
 * @param {object} ctx context
 * @returns {string} section
 */
function mainContent(ctx) {
  const profileOptions = th.indented(4, (ctx?.profilesScopes?.profiles || []).map((profile) => renderProfileOption(profile)))
    .join('\n');
  const elideScopes = ['profile', 'email'];
  const allScopes = Object.keys(ctx?.profilesScopes?.scopeIndex || {});
  const displayScopes = (allScopes).filter((scope) => !elideScopes.includes(scope));
  const scopesCheckboxRows = th.indented(5, displayScopes.map((scope) => renderScopeCheckboxTR(scope)))
    .join('\n');
  return `<section>
\t<form method="POST">
\t\t<div>
\t\t\tYou may proactively send a ticket to a third-party site,
\t\t\twhich they may redeem for an access token which grants additional
\t\t\taccess to the specified resource.
\t\t</div>
\t\t<br>
\t\t<fieldset>
\t\t\t<legend>Proffer A Ticket</legend>
\t\t\t<label for="profile-select">Profile Granting this Ticket</label>
\t\t\t<select id="profile-select" name="profile">
${profileOptions}
\t\t\t</select>
\t\t\t<br>
\t\t\t<label for="resource-url">Resource URL:</label>
\t\t\t<input type="url" id="resource-url" name="resource" size="96">
\t\t\t<br>
\t\t\t<label for="recipient-url">Recipient URL:</label>
\t\t\t<input type="url" id="recipient-url" name="subject" size="96">
\t\t\t<br>
<fieldset>
<legend>Scopes</legend>
\t\t\t<table>
\t\t\t\t<tbody>
${scopesCheckboxRows}
\t\t\t\t</tbody>
\t\t\t</table>
</fieldset>
\t\t\t<br>
\t\t\t<label for="scopes-adhoc">Additional Scopes (space separated):</label>
\t\t\t<input type="text" id="scopes-adhoc" name="adhoc" size="96">
\t\t\t<br>
\t\t\t<button type="submit" name="action" value="proffer-ticket">Send Ticket</button>
\t\t</fieldset>
\t</form>
</section>`;
}


/**
 * 
 * @param {object} ctx context
 * @param {object} ctx.profilesScopes.scopeIndex scopes structure
 * @param {string[]} ctx.profileScopes.profiles profile
 * @param {object} options options
 * @param {object} options.manager manager options
 * @param {string} options.manager.pageTitle page title
 * @param {string} options.manager.logoUrl logo url
 * @param {string[]} options.manager.footerEntries footer entries
 * @returns {string} page
 */
module.exports = (ctx, options) => {
  const pagePathLevel = 1;
  const htmlOptions = {
    pageIdentifier: 'ticketProffer',
    pageTitle: options.manager.pageTitle + ' - Ticket Proffer',
    logoUrl: options.manager.logoUrl,
    footerEntries: options.manager.footerEntries,
    errorContent: ['Unable to send ticket.'],
  };
  th.navLinks(pagePathLevel, ctx, htmlOptions);
  sessionNavLinks(pagePathLevel, ctx, htmlOptions);
  const content = [
    mainContent(ctx),
  ];
  return th.htmlPage(pagePathLevel, ctx, htmlOptions, content);
};