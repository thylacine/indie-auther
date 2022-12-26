/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/admin-maintenance-html');
const Config = require('../../../config');
const StubLogger = require('../../stub-logger');
const lint = require('html-minifier-lint').lint; // eslint-disable-line node/no-unpublished-require

const stubLogger = new StubLogger();

function lintHtml(html) {
  const result = lint(html);
  stubLogger.debug('validHtml', '', { result, html });
  assert(!result);
}

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
  it('renders', function () {
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });
  it('covers failsafes', function () {
    delete ctx.almanac;
    delete ctx.chores;
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });
}); // Admin Ticket HTML Template
