'use strict';

const th = require('./template-helper');
const { sessionNavLinks } = require('@squeep/authentication-module');

/**
 * @param {object} hApp client identifier h-app
 * @param {object} hApp.properties properties
 * @param {string[]=} hApp.properties.url url
 * @param {string[]=} hApp.properties.summary summary
 * @param {string[]=} hApp.properties.logo logo
 * @param {string[]=} hApp.properties.name name
 * @returns {string} span
 */
function renderClientIdentifierProperties(hApp) {
  const properties = hApp.properties || {};
  const parts = [];
  let imgTitle = '';
  const { url, summary, logo, name } = properties;

  parts.push('<span class="client-identifier">');
  if (url?.length) {
    parts.push(`<a href="${url[0]}">`);
  }
  if (summary?.length) {
    imgTitle = ` title="${summary[0]}"`;
  }
  if (logo?.length) {
    let src, alt;
    if (typeof logo[0] === 'string') {
      src = logo[0];
      alt = 'Client Identifier Logo';
    } else {
      ({ value: src, alt } = logo[0]);
    }
    parts.push(`<img src="${src}" alt="${alt}"${imgTitle}>`);
  }
  if (name?.length) {
    parts.push(properties['name'][0]);
  }
  if (url?.length) {
    parts.push('</a>');
  }
  parts.push('</span>');
  return parts.join('');
}


/**
 * @param {object} clientIdentifier client identifier
 * @param {object[]} clientIdentifier.items items
 * @returns {string} spans
 */
function renderClientIdentifier(clientIdentifier) {
  const hAppEntries = clientIdentifier?.items || [];
  return hAppEntries.map(renderClientIdentifierProperties).join('');
}


/**
 * @param {string} profile profile
 * @param {boolean} selected is selected
 * @returns {string} option
 */
function renderProfileOption(profile, selected) {
  return `<option value="${profile}"${selected ? ' selected' : ''}>${profile}</option>`;
}


/**
 * @param {string[]} availableProfiles profiles
 * @param {string} hintProfile profile
 * @returns {string} fieldset
 */
function renderProfileFieldset(availableProfiles, hintProfile) {
  if (!availableProfiles || availableProfiles.length <= 1) {
    const profile = availableProfiles?.[0] || hintProfile;
    return `<input type="hidden" name="me" value="${profile}">`;
  }
  return `
  <br>
  <fieldset>
    <legend>Select Profile</legend>
    <div>
      You may choose to identify to this client with a different profile.
    </div>
    <label for="me">Choose your identifying profile</label>
    <select class="uri" name="me" id="me">
${availableProfiles.map((profile) => renderProfileOption(profile, profile === hintProfile)).join('\n')}
    </select>
  </fieldset>`;
}


/**
 * @typedef {object} ScopeDetails
 * @property {string} scope scope
 * @property {string} description description
 * @property {string[]} profiles profiles
 */

/**
 * @param {ScopeDetails} scope scope details
 * @param {boolean} checked is checked
 * @returns {string} scope li
 */
function renderScopeCheckboxLI(scope, checked) {
  let scopeDescription;
  if (scope.description) {
    scopeDescription = `
          <span class="description">${scope.description}</span>`;
  } else {
    scopeDescription = '';
  }
  let profileClass;
  if (scope.profiles?.length) {
    profileClass = ['profile-scope'].concat(scope.profiles).join(' ');
  } else {
    profileClass = '';
  }
  return `
        <li class="${profileClass}">
          <input type="checkbox" id="scope_${scope.scope}" name="accepted_scopes[]" value="${scope.scope}"${checked ? ' checked' : ''}>
          <label for="scope_${scope.scope}">${scope.scope}</label>${scopeDescription}
        </li>`;
}


/**
 *
 * @param {ScopeDetails[]=} requestedScopes scope details
 * @returns {string} fieldset
 */
function renderRequestedScopes(requestedScopes) {
  if (!requestedScopes?.length) {
    return '';
  }
  return `
  <br>
  <fieldset>
    <legend>Grants Requested By Client</legend>
    <div>
      In addition to identifying you by your profile URL, this client has requested the following additional scope thingies.  You may disable any of them here.
    </div>
    <ul class="scope" id="requested-scope-list">
${requestedScopes.map((scopeDetails) => renderScopeCheckboxLI(scopeDetails, true)).join('\n')}
    </ul>
  </fieldset>`;
}

/**
 * @param {ScopeDetails[]} additionalScopes scopes
 * @returns {string} fieldset
 */
function renderAdditionalScopes(additionalScopes) {
  const parts = [];
  parts.push(`
  <br>
  <fieldset>
    <legend>Additional Grants</legend>`);
  if (additionalScopes?.length) {
    parts.push(`
    <div>
      Your profile has been configured to offer scopes which were not explicitly requested by the client application.
      Select any you would like to include.
    </div>
    <ul class="scope" id="additional-scope-list">
${additionalScopes.map((scopeDetails) => renderScopeCheckboxLI(scopeDetails, false)).join('\n')}
    </ul>
    <br>`);
  }
  parts.push(`
    <div>
      You may also specify a space-separated list of any additional ad hoc scopes you would like to associate with this authorization request, which were not explicitly requested by the client application.
    </div>
    <label for="ad-hoc-scopes">Ad Hoc Scopes</label>
    <input type="text" id="ad-hoc-scopes" name="ad_hoc_scopes" value="">
  </fieldset>`);
  return parts.join('');
}


/**
 * 
 * @param {string[]} requestedScopes scopes
 * @returns {string} fieldset
 */
function renderExpiration(requestedScopes) {
  const tokenableScopes = requestedScopes.filter((s) => !['profile', 'email'].includes(s));
  if (!tokenableScopes.length) {
    return '';
  }
  return `
\t<br>
\t<fieldset>
\t\t<legend>Expiration</legend>
\t\t<div>
\t\t\tBy default, tokens issued do not automatically expire, but a longevity can be enforced.
\t\t</div>
\t\t<br>
\t\t<details>
\t\t\t<summary>Set Expiration</summary>
\t\t\t\t${radioButton('expires', 'never', 'Never', true)}
\t\t\t\t${radioButton('expires', '1d', '1 Day')}
\t\t\t\t${radioButton('expires', '1w', '1 Week')}
\t\t\t\t${radioButton('expires', '1m', '1 Month')}
\t\t\t<div>
\t\t\t\t${radioButton('expires', 'custom', 'Other:')}
\t\t\t\t<input type="number" id="expires-seconds" name="expires-seconds">
\t\t\t\t<label for="expires-seconds">seconds</label>
\t\t\t</div>
\t\t\t<br>
\t\t\t<div>
\t\t\t\tTokens with expirations may be allowed to be renewed for a fresh token for an amount of time after they expire.
\t\t\t</div>
\t\t\t\t${radioButton('refresh', 'none', 'Not Refreshable', true)}
\t\t\t\t${radioButton('refresh', '1d', '1 Day')}
\t\t\t\t${radioButton('refresh', '1w', '1 Week')}
\t\t\t\t${radioButton('refresh', '1m', '1 Month')}
\t\t\t<div>
\t\t\t\t${radioButton('refresh', 'custom', 'Other:')}
\t\t\t\t<input type="number" id="refresh-seconds" name="refresh-seconds">
\t\t\t\t<label for="refresh-seconds">seconds</label>
\t\t\t</div>
\t\t</details>
\t</fieldset>`;
}

/**
 *
 * @param {string} name name
 * @param {string} value value
 * @param {string} label label
 * @param {boolean} checked is checked
 * @param {number} indent indent
 * @returns {string} div
 */
function radioButton(name, value, label, checked = false, indent = 0) {
  const id = `${name}-${value}`;
  return th.indented(indent, [
    '<div>',
    `\t<input type="radio" name="${name}" id="${id}" value="${value}"${checked ? ' checked' : ''}>`,
    `\t<label for="${id}">${label}</label>`,
    '</div>',
  ]).join('');
}

/**
 * @alias {object} ScopeIndex
 */

/**
 * 
 * @param {object} ctx context
 * @param {object[]} ctx.notifications notifications
 * @param {object} ctx.session session
 * @param {string[]=} ctx.session.scope scopes
 * @param {URL=} ctx.session.me profile
 * @param {string[]} ctx.session.profiles profiles
 * @param {ScopeIndex} ctx.session.scopeIndex scopes structure
 * @param {object} ctx.session.clientIdentifier client identifier
 * @param {object[]} ctx.session.clientIdentifier.items items
 * @param {object} ctx.session.clientIdentifier.items.properties properties
 * @param {string[]=} ctx.session.clientIdentifier.items.properties.url url
 * @param {string[]=} ctx.session.clientIdentifier.items.properties.summary sumamry
 * @param {string[]=} ctx.session.clientIdentifier.items.properties.logo logo
 * @param {string[]=} ctx.session.clientIdentifier.items.properties.name name
 * @param {string} ctx.session.clientId client id
 * @param {string} ctx.session.persist persist
 * @param {string} ctx.session.redirectUri redirect
 * @param {object} options options
 * @returns {string} section
 */
function mainContent(ctx, options) { // eslint-disable-line no-unused-vars
  const session = ctx.session || {};
  const hintedProfile = session.me?.href || session.profiles?.[0] || '';
  const scopeIndex = session.scopeIndex || {};

  /**
   * Add requested scopes to index, if not already present,
   * and de-associate requested scopes from profiles.
   */
  const scopes = session.scope || [];
  scopes.forEach((scopeName) => {
    if ((scopeName in scopeIndex)) {
      scopeIndex[scopeName].profiles = []; // eslint-disable-line security/detect-object-injection
    } else {
      scopeIndex[scopeName] = { // eslint-disable-line security/detect-object-injection
        description: '',
        profiles: [],
      };
    }
  });

  // Divide scopes between requested and additional from profiles.
  const requestedScopes = scopes.map((scope) => ({
    scope,
    description: scopeIndex[scope].description, // eslint-disable-line security/detect-object-injection
  }));
  const additionalScopes = Object.keys(scopeIndex)
    .filter((scope) => scopeIndex[scope].profiles.length) // eslint-disable-line security/detect-object-injection
    .map((scope) => ({
      scope,
      description: scopeIndex[scope].description, // eslint-disable-line security/detect-object-injection
      profiles: scopeIndex[scope].profiles, // eslint-disable-line security/detect-object-injection
    }));

  return [
    `<section class="information">
\tThe application client ${renderClientIdentifier(session.clientIdentifier)} at <a class="uri" aria-label="client-identifier" id="${session.clientId}">${session.clientId}</a> would like to identify you as <a class="uri" aria-label="profile"${hintedProfile ? ' id="' + hintedProfile + '"' : ''}>${hintedProfile || '(unspecified)'}</a>.
</section>
<section class="choices">
\t<form action="consent" method="POST" class="form-consent">`,
    renderProfileFieldset(session.profiles, hintedProfile),
    renderRequestedScopes(requestedScopes),
    renderAdditionalScopes(additionalScopes),
    renderExpiration(requestedScopes),
    `
\t\t<br>
\t\t<fieldset>
\t\t\t<legend>Do you want to allow this?</legend>
\t\t\t<button type="submit" class="button-accept" name="accept" value="true">Accept</button>
\t\t\t<button type="submit" class="button-decline" name="accept" value="false">Decline</button>
\t\t</fieldset>
\t\t<input type="hidden" name="session" value="${session.persist}">
\t</form>
\t<br>
\t<div>
\t\tYou will be redirected to <a class="uri" id="${session.redirectUri ? session.redirectUri : 'unknown-redirect'}">${session.redirectUri}</a>.
\t</div>
</section>`,
  ];
}

/**
 * 
 * @param {object} ctx context
 * @param {object} ctx.session session object
 * @param {string[]=} ctx.session.scope scopes
 * @param {URL=} ctx.session.me url
 * @param {string[]} ctx.session.profiles profiles
 * @param {ScopeIndex} ctx.session.scopeIndex scopes structure
 * @param {object} ctx.session.clientIdentifier client identifier
 * @param {string} ctx.session.clientId client id
 * @param {string} ctx.session.persist persist
 * @param {string} ctx.session.redirectUri redirect url
 * @param {object} options options
 * @param {object} options.manager manager options
 * @param {string} options.manager.pageTitle page title
 * @param {string} options.manager.footerEntries footer entries
 * @returns {string} page
 */
module.exports = (ctx, options) => {
  const pagePathLevel = 0;
  const htmlOptions = {
    pageTitle: `${options.manager.pageTitle} &mdash; Authorization Request`,
    logoUrl: options.manager.logoUrl,
    footerEntries: options.manager.footerEntries,
    headElements: [
      `<script>
function queryAll(query, fn) {
  const nodes = document.querySelectorAll(query);
  console.log('query ' + query + ' selected ' + nodes.length);
  return nodes.forEach(fn);
}
function profileSelected(element) {
  const profileClass = CSS.escape(element.value);
  // queryAll('.profile-scope input', (n) => n.setAttribute('disabled', ''));
  queryAll('.profile-scope', (n) => n.classList.add('disabled'));
  const profileQuery = '.profile-scope.' + profileClass;
  // queryAll(profileQuery + ' input', (n) => n.removeAttribute('disabled'));
  queryAll(profileQuery, (n) => n.classList.remove('disabled'));
}
function onLoad() {
  const profileSelect = document.getElementById('me');
  profileSelect.onchange = () => profileSelected(profileSelect);
  profileSelected(profileSelect);
}
window.onload = onLoad;
</script>`,
    ],
  };
  th.navLinks(pagePathLevel, ctx, htmlOptions);
  sessionNavLinks(pagePathLevel, ctx, htmlOptions);
  const content = mainContent(ctx, options);
  return th.htmlPage(pagePathLevel, ctx, htmlOptions, content);
};
