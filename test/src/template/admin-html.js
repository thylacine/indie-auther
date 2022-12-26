/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/admin-html');
const Config = require('../../../config');
const StubLogger = require('../../stub-logger');
const lint = require('html-minifier-lint').lint; // eslint-disable-line node/no-unpublished-require

const stubLogger = new StubLogger();

function lintHtml(html) {
  const result = lint(html);
  stubLogger.debug('validHtml', '', { result, html });
  assert(!result);
}

describe('Admin HTML Template', function () {
  let ctx, config;
  beforeEach(function () {
    ctx = {
      profilesScopes: {
        scopeIndex: {
          'scope': {
            application: '',
            description: '',
            isPermanent: true,
            isManuallyAdded: false,
            profiles: ['https://example.com/'],
          },
          'other_scope': {
            application: 'app1',
            description: '',
            isPermanent: false,
            isManuallyAdded: true,
            profiles: [],
          },
          'more_scope': {
            application: 'app2',
            description: '',
            isPermanent: false,
            isManuallyAdded: false,
            profiles: [],
          },
          'scopitty_scope': {
            application: 'app2',
            description: '',
            isPermanent: false,
            isManuallyAdded: false,
            profiles: [],
          },
          'last_scope': {
            application: 'app1',
            description: '',
            isPermanent: false,
            isManuallyAdded: false,
            profiles: [],
          },
        },
        profiles: ['https://example.com/'],
      },
      tokens: [
        {
          codeId: 'xxx',
          clientId: 'https://client.example.com/',
          profile: 'https://profile.example.com/',
          created: new Date(),
          expires: null,
          isRevoked: false,
        },
        {
          codeId: 'yyy',
          clientId: 'https://client.example.com/',
          profile: 'https://profile.example.com/',
          isToken: true,
          created: new Date(Date.now() - 86400000),
          refreshed: new Date(),
          expires: new Date(Date.now() + 86400000),
          isRevoked: true,
        },
        {
          codeId: 'zzz',
          clientId: 'https://client.exmaple.com/',
          profile: 'https://profile.example.com/',
          resource: 'https://resource.example.com/',
          created: new Date(),
          scopes: ['read'],
        },
      ],
    };
    config = new Config('test');
  });
  it('renders', function () {
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });
  it('renders no tokens', function () {
    ctx.tokens = [];
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });
  it('covers options', function () {
    delete ctx.profilesScopes.profiles;
    delete ctx.profilesScopes.scopeIndex.scope.profiles;
    delete ctx.tokens;
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });
}); // Admin HTML Template
