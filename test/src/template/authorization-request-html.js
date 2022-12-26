/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/authorization-request-html');
const Config = require('../../../config');
const StubLogger = require('../../stub-logger');
const lint = require('html-minifier-lint').lint; // eslint-disable-line node/no-unpublished-require

const stubLogger = new StubLogger();

function lintHtml(html) {
  const result = lint(html);
  stubLogger.debug('validHtml', '', { result, html });
  assert(!result);
}

describe('Authorization Request HTML Template', function () {
  let ctx, config;
  beforeEach(function () {
    ctx = {};
    config = new Config('test');
  });
  it('renders', function () {
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });
  it('covers options', function () {
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
    lintHtml(result);
    assert(result);
  });
  it('covers alternate scopes and client logo', function () {
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
    lintHtml(result);
    assert(result);
  });
  it('covers partial data', function () {
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
    lintHtml(result);
    assert(result);
  });
  it('covers partial data', function () {
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
    lintHtml(result);
    assert(result);
  });
}); // Authorization Request HTML Template
