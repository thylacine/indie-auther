'use strict';

/**
 * Scrub credential from POST login body data.
 * @param {Object} data
 * @param {Boolean} sanitize
 * @returns {Boolean}
 */
function sanitizePostCredential(data, sanitize = true) {
  let unclean = false;

  [
    'credential',
    'credential-old',
    'credential-new',
    'credential-new-2',
  ].forEach((k) => {
    const credentialLength = data?.ctx?.parsedBody?.[k]?.length; // eslint-disable-line security/detect-object-injection
    const kUnclean = !!credentialLength;
    unclean |= kUnclean;
    if (kUnclean && sanitize) {
      data.ctx.parsedBody[k] = '*'.repeat(credentialLength); // eslint-disable-line security/detect-object-injection
    }
  });

  return unclean;
}


/**
 * Scrub sensitive data from context.
 * @param {Object} data
 * @param {Boolean} sanitize
 * @returns {Boolean}
 */
function sanitizeContext(data, sanitize = true) {
  let unclean = false;

  // hide keys
  [
    'otpKey',
    'otpConfirmKey',
  ].forEach((k) => {
    const secretLength = data?.ctx?.[k]?.length; // eslint-disable-line security/detect-object-injection
    const kUnclean = !! secretLength;
    unclean |= kUnclean;
    if (kUnclean && sanitize) {
      data.ctx[k] = '*'.repeat(secretLength); // eslint-disable-line security/detect-object-injection
    }
  });

  // shorten mystery boxes
  [
    'otpConfirmBox',
    'otpState',
  ].forEach((k) => {
    const mysteryLength = data?.ctx?.[k]?.length; // eslint-disable-line security/detect-object-injection
    const mUnclean = !! mysteryLength;
    unclean |= mUnclean;
    if (mUnclean && sanitize) {
      data.ctx[k] = `[scrubbed ${mysteryLength} bytes]`; // eslint-disable-line security/detect-object-injection
    }
  });

  const cookieLength = data?.ctx?.cookie?.squeepSession?.length;
  if (cookieLength) {
    unclean |= true;
    if (sanitize) {
      data.ctx.cookie.squeepSession = `[scrubbed ${cookieLength} bytes]`;
    }
  }

  return !! unclean;
}


/**
 * Reduce logged data about scopes from profilesScopes.
 * For all referenced scopes, only include profiles list.
 * Remove scopes without profile references from scopeIndex.
 * @param {Object} data
 * @param {Boolean} sanitize
 */
function reduceScopeVerbosity(data, sanitize = true) {
  let unclean = false;

  const {
    scopesEntries: ctxScopesEntries,
    profilesEntries: ctxProfilesEntries,
    needsSanitize: ctxNeedsSanitize,
  } = _scopesFrom(data?.ctx?.profilesScopes);

  const {
    scopesEntries: sessionScopesEntries,
    profilesEntries: sessionProfilesEntries,
    needsSanitize: sessionNeedsSanitize,
  } = _scopesFrom(data?.ctx?.session);

  if (ctxNeedsSanitize || sessionNeedsSanitize) {
    unclean = true;
  }
  if (unclean && sanitize) {
    if (ctxNeedsSanitize) {
      Object.assign(data.ctx.profilesScopes, _sanitizeProfilesScopes(ctxScopesEntries, ctxProfilesEntries));
    }
    if (sessionNeedsSanitize) {
      Object.assign(data.ctx.session, _sanitizeProfilesScopes(sessionScopesEntries, sessionProfilesEntries));
    }
  }

  return unclean;
}


/**
 * Return any scope entries on an object, and whether sanitization is needed.
 * @param {Object=} obj
 * @returns {Object}
 */
const _scopesFrom = (obj) => {
  const scopesEntries = Object.entries(obj?.scopeIndex || {});
  const profilesEntries = Object.entries(obj?.profileScopes || {});
  const needsSanitize = scopesEntries.length || profilesEntries.length;
  return {
    scopesEntries,
    profilesEntries,
    needsSanitize,
  };
};


/**
 * @typedef {[String, Object]} ScopeEntry
 */
/**
 * Return new list of entries with scrubbed scopeDetails.
 * @param {ScopeEntry[]} entries
 * @returns {ScopeEntry[]}
 */
const _scopeEntriesScrubber = (entries) => entries.map(([scopeName, scopeDetails]) => ([scopeName, { profiles: scopeDetails.profiles }]));


/**
 * Create a new profilesScopes type object with scrubbed scope details.
 * @param {ScopeEntry[]} scopesEntries
 * @param {ScopeEntry[]} profilesEntries
 * @returns {Object}
 */
const _sanitizeProfilesScopes = (scopesEntries, profilesEntries) => {
  const referencedScopesEntries = scopesEntries.filter(([_scopeName, scopeDetails]) => scopeDetails?.profiles?.length); // eslint-disable-line no-unused-vars
  const scrubbedScopesEntries = _scopeEntriesScrubber(referencedScopesEntries);

  const scrubbedProfilesEntries = profilesEntries.map(([profileName, profileScopes]) => {
    const profileScopeEntries = Object.entries(profileScopes);
    const scrubbedProfileScopeEntries = _scopeEntriesScrubber(profileScopeEntries);
    const scrubbedProfileScopes = Object.fromEntries(scrubbedProfileScopeEntries);
    return [profileName, scrubbedProfileScopes];
  });

  return {
    scopeIndex: Object.fromEntries(scrubbedScopesEntries),
    profileScopes: Object.fromEntries(scrubbedProfilesEntries),
  };
};

module.exports = {
  sanitizePostCredential,
  sanitizeContext,
  reduceScopeVerbosity,
};
