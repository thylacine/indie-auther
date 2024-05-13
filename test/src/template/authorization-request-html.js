/* eslint-disable sonarjs/no-duplicate-string */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/authorization-request-html');
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

describe('Authorization Request HTML Template', function () {
  let ctx, config;
  beforeEach(function () {
    ctx = {};
    config = new Config('test');
  });
  it('renders', async function () {
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
  it('covers options', async function () {
    ctx.session = {
      scope: ['profile', 'email'],
      scopeIndex: {
        'profile': {
          description: 'Profile',
        },
        'email': {
          description: 'Email',
        },
        'create': {
          description: 'Create',
          profiles: ['https://exmaple.com/profile'],
        },
      },
      me: new URL('https://example.com/profile'),
      profiles: ['https://another.example.com/profile', 'https://example.com/profile'],
      clientIdentifier: {
        items: [{
          properties: {
            url: 'https://client.example.com/app/',
            summary: 'This is an app',
            logo: 'https://client.example.com/app/logo.png',
            name: 'Some Fancy Application',
          },
        }],
      },
      clientId: 'https://client.example.com/app/',
      persist: 'encodedData',
      redirectUri: 'https://client.example.com/app/_return',
    };
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
  it('covers alternate scopes and client logo', async function () {
    ctx.session = {
      scope: ['profile', 'email'],
      scopeIndex: {
        'profile': {
          description: 'Profile',
        },
        'email': {
          description: 'Email',
        },
        'create': {
          description: 'Create',
          profiles: ['https://example.com/profile'],
        },
        'other': {
          description: 'Another Scope',
          profiles: ['https://example.com/profile'],
        },
      },
      me: new URL('https://example.com/profile'),
      profiles: ['https://another.example.com/profile', 'https://example.com/profile'],
      clientIdentifier: {
        items: [{
          properties: {
            url: 'https://client.example.com/app/',
            summary: 'This is an app',
            logo: [{
              value: 'https://client.example.com/app/logo.png',
              alt: 'alt',
            }],
            name: 'Some Fancy Application',
          },
        }],
      },
      clientId: 'https://client.example.com/app/',
      persist: 'encodedData',
      redirectUri: 'https://client.example.com/app/_return',
    };
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
  it('covers partial data', async function () {
    ctx.session = {
      scope: ['profile', 'email', 'create'],
      profiles: ['https://another.example.com/profile', 'https://example.com/profile'],
      clientIdentifier: {
        items: [{
          properties: {
            url: 'https://client.example.com/app/',
            summary: 'This is an app',
            logo: 'https://client.example.com/app/logo.png',
            name: 'Some Fancy Application',
          },
        }],
      },
      clientId: 'https://client.example.com/app/',
      persist: 'encodedData',
      redirectUri: 'https://client.example.com/app/_return',
    };
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
  it('covers partial data', async function () {
    ctx.session = {
      scope: ['profile', 'email', 'create'],
      profiles: [],
      clientIdentifier: {
        items: [{
        }],
      },
      clientId: 'https://client.example.com/app/',
      persist: 'encodedData',
      redirectUri: 'https://client.example.com/app/_return',
    };
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
}); // Authorization Request HTML Template
