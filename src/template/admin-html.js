'use strict';

/**
 * This renders the administrative view for an account,
 * allowing for adding profile URIs, custom scope bundles,
 * and management of issued tokens.
 */

const th = require('./template-helper');


function renderProfileLI(profile) {
  return `\t<li><a class="uri" name="${profile}">${profile}</a></li>`;
}


function renderProfileScopeIndicator(profile, scope, selected) {
  const checked = selected ? ' checked' : '';
  return `\t\t<td>
\t\t\t<input type="checkbox" id="${profile}-${scope}" name="scopes-${profile}" value="${scope}"${checked}>
\t\t</td>`;
}

function renderScopeRow(scope, details, profiles) {
  return `\t<tr class="scope">
${(profiles || []).map((profile) => renderProfileScopeIndicator(profile, scope, details.profiles.includes(profile))).join('\n')}
\t\t<th scope="row"><label>${scope}<label></th>
\t\t<td class="description">${details.description}</td>
\t\t<td>${details.application}</td>
\t\t<td class="scope-actions">` +
    (details.isManuallyAdded ? `
\t\t\t<button name="action" value="delete-scope-${encodeURIComponent(scope)}">Delete</button>
` : '') + `
\t\t</td>
\t</tr>`;
}


function renderProfileHeader(profile) {
  return `<th class="vertical uri">
\t\t${profile}
</th>`;
}


function scopeIndexTable(scopeIndex, profiles) {
  return `<table>
<thead>
\t<tr>
${(profiles || []).map((profile) => renderProfileHeader(profile)).join('\n')}
\t\t<th>Scope</th>
\t\t<th>Description</th>
\t\t<th>Application</th>
\t\t<th class="scope-actions"></th>
\t</tr>
</thead>
<tbody>
${Object.entries(scopeIndex).sort(th.scopeCompare).map(([scope, details]) => renderScopeRow(scope, details, profiles)).join('\n')}
</tbody>
</table>`;
}

function _tokenType(token) {
  if (token.resource) {
    return 'ticket-token';
  }
  if (!token.isToken) {
    return 'profile';
  }
  return 'token';
}

function renderTokenRow(token) {
  const createdTitle = token.refreshed ? 'Refreshed At' : 'Created At';
  const createdDate = token.refreshed ? token.refreshed : token.created;
  return `\t\t<tr>
<td>${_tokenType(token)}</td>
\t\t\t<td class="uri">${token.clientId}</td>
\t\t\t<td class="uri">${token.profile}</td>
<td class="scope">${(token.scopes || []).join(', ')}</td>
\t\t\t<td class="code">${token.codeId}</td>
\t\t\t<td>${th.timeElement(createdDate, { title: createdTitle })}</td>
\t\t\t<td>${th.timeElement(token.expires, { title: 'Expires At' })}</td>
\t\t\t<td>${token.isRevoked}</td>
<td>${token.resource ? token.resource : ''}</td>
\t\t\t<td>` + (
    token.isRevoked ? '' : `
\t\t\t\t<button name="action" value="revoke-${token.codeId}">Revoke</button>`) + `
\t\t\t</td>
\t\t</tr>`;
}

function noTokensRows() {
  return [`\t\t<tr>
\t\t\t<td colspan="100%" class="centered">(No active or recent tokens.)</td>
\t\t</tr>`];
}

function tokenTable(tokens) {
  const tokenRows = tokens?.length ? tokens.map((token) => renderTokenRow(token)) : noTokensRows();
  return `<table>
\t<thead>
\t\t<tr>
<th>Type</th>
\t\t\t<th>Client Identifier / Ticket Subject</th>
\t\t\t<th>Profile</th>
<th>Scopes</th>
\t\t\t<th>Code</th>
\t\t\t<th>Created or Refreshed</th>
\t\t\t<th>Expires</th>
\t\t\t<th>Revoked</th>
<th>Resource</th>
\t\t\t<th></th>
\t\t</tr>
\t</thead>
\t<tbody>
${tokenRows.join('\n')}
\t</tbody>
</table>`;
}

function mainContent(ctx) {
  return `<section>
\t<h2>Profiles</h2>
\t<ul>
\t${(ctx.profilesScopes?.profiles || []).map((p) => renderProfileLI(p)).join('\n')}
\t</ul>
\t<form action="" method="POST">
\t\t<fieldset>
\t\t\t<legend>Add New Profile</legend>
\t\t\t<div>
\t\t\t\tThe profile identity URIs associated with this account.
\t\t\t\tEach must indicate this service as the authorization endpoint.
\t\t\t</div>
\t\t\t<br>
\t\t\t<label for="profile">Profile URL:</label>
\t\t\t<input type="url" id="profile" name="profile" size="96">
\t\t\t<button name="action" value="new-profile">Add Profile</button>
\t\t</fieldset>
\t</form>
</section>
<section>
\t<h2>Scopes</h2>
\t<form action="" method="POST">
\t\t<details>
\t\t<summary>
\t\tScopes Associated with Profiles for Convenience
\t\t</summary>
\t\t\t<fieldset>
\t\t\t\t<legend>Manage Additional Profile Scope Availability</legend>
\t\t\t\t<div>
\t\t\t\t\tThis table lists pre-defined scopes which you can choose to add to any authorization request, whether the client requested them or not.
\t\t\t\t\tSelecting one for a profile makes it conveniently available for quick inclusion when authorizing a client request.
\t\t\t\t\tAny scope not in this table or not selected for a profile can always be added in the ad hoc field on the authorization request.
\t\t\t\t</div>
\t\t\t\t<br>
\t\t${scopeIndexTable(ctx.profilesScopes.scopeIndex, ctx.profilesScopes.profiles)}
\t\t\t\t<button name="action" value="save-scopes">Save</button>
\t\t\t</fieldset>
\t\t</form>
\t\t<br>
\t\t<form action="" method="POST">
\t\t\t<fieldset>
\t\t\t\t<legend>Add New Scope</legend>
\t\t\t\t<label for="scope">Scope:</label>
\t\t\t\t<input type="text" id="scope" name="scope">
\t\t\t\t<label for="description">Description:</label>
\t\t\t\t<input type="text" id="description" name="description">
\t\t\t\t<label for="application">Application:</label>
\t\t\t\t<input type="text" id="application" name="application">
\t\t\t\t<button name="action" value="new-scope">Add Scope</button>
\t\t\t</fieldset>
\t\t</details>
\t</form>
</section>
<section>
\t<h2>Tokens</h2>
\t<form action="" method="POST">
${tokenTable(ctx.tokens)}
\t</form>
</section>`;
}


/**
 * 
 * @param {Object} ctx
 * @param {Object} ctx.profilesScopes.scopeIndex
 * @param {String[]} ctx.profilesScopes.profiles
 * @param {Object[]} ctx.tokens
 * @param {Object} options
 * @param {Object} options.manager
 * @param {String} options.manager.pageTitle
 * @param {String} options.manager.logoUrl
 * @param {String[]} options.manager.footerEntries
 * @returns {String}
 */
module.exports = (ctx, options) => {
  const htmlOptions = {
    pageTitle: options.manager.pageTitle,
    logoUrl: options.manager.logoUrl,
    footerEntries: options.manager.footerEntries,
    navLinks: [
      {
        text: 'Ticket',
        href: 'ticket',
      },
    ],
  };
  const content = [
    mainContent(ctx),
  ];
  return th.htmlPage(1, ctx, htmlOptions, content);
};
