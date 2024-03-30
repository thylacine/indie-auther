/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/admin-maintenance-html');
const Config = require('../../../config');
const StubLogger = require('../../stub-logger');
const { makeHtmlLint } = require('@squeep/html-template-helper');
const { HtmlValidate } = require('html-validate');

const stubLogger = new StubLogger();
const htmlValidate = new HtmlValidate();
const lintHtml = makeHtmlLint(stubLogger, htmlValidate);

describe('Admin Management HTML Template', function () {
  let ctx, config;
  beforeEach(function () {
    ctx = {
      almanac: [{
        event: 'exampleChore',
        date: new Date(),
      }],
      chores: {
        exampleChore: {
          intervalMs: 86400,
          nextSchedule: new Date(),
        },
      },
    };
    config = new Config('test');
  });
  it('renders', async function () {
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
  it('covers failsafes', async function () {
    delete ctx.almanac;
    delete ctx.chores;
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
}); // Admin Ticket HTML Template
