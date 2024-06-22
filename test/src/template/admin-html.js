'use strict';

const assert = require('assert');
const template = require('../../../src/template/admin-html');
const Config = require('../../../config');
const StubLogger = require('../../stub-logger');
const { makeHtmlLint } = require('@squeep/html-template-helper');
const { HtmlValidate } = require('html-validate');

const stubLogger = new StubLogger();
const htmlValidate = new HtmlValidate({
  extends: [
    'html-validate:recommended',
  ],
  rules: {
    'valid-id': ['error', { relaxed: true }], // allow profile uri to be component of id
  },
});
const lintHtml = makeHtmlLint(stubLogger, htmlValidate);

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
  it('renders', async function () {
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
  it('renders no tokens', async function () {
    ctx.tokens = [];
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
  it('covers options', async function () {
    delete ctx.profilesScopes.profiles;
    delete ctx.profilesScopes.scopeIndex.scope.profiles;
    delete ctx.tokens;
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
}); // Admin HTML Template
