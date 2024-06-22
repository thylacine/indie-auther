'use strict';

const assert = require('assert');
const template = require('../../../src/template/admin-ticket-html');
const Config = require('../../../config');
const StubLogger = require('../../stub-logger');
const { makeHtmlLint } = require('@squeep/html-template-helper');
const { HtmlValidate } = require('html-validate');

const stubLogger = new StubLogger();
const htmlValidate = new HtmlValidate();
const lintHtml = makeHtmlLint(stubLogger, htmlValidate);

describe('Admin Ticket HTML Template', function () {
  let ctx, config;
  beforeEach(function () {
    ctx = {
      profilesScopes: {
        scopeIndex: {
          'profile': {
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
          'read': {
            application: 'app2',
            description: '',
            isPermanent: true,
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
        profileScopes: {
          'https://example.com': {
            'profile': {
              application: '',
              description: '',
              isPermanent: true,
              isManuallyAdded: false,
              profiles: ['https://example.com/'],
            },
          },
        },
        profiles: ['https://example.com/'],
      },
    };
    config = new Config('test');
  });
  it('renders', async function () {
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
  it('covers branches', async function () {
    delete ctx.profilesScopes;
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
}); // Admin Ticket HTML Template
