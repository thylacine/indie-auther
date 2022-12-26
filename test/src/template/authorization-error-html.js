/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/authorization-error-html');
const Config = require('../../../config');
const StubLogger = require('../../stub-logger');
const lint = require('html-minifier-lint').lint; // eslint-disable-line node/no-unpublished-require

const stubLogger = new StubLogger();

function lintHtml(html) {
  const result = lint(html);
  stubLogger.debug('validHtml', '', { result, html });
  assert(!result);
}

describe('Authorization Error HTML Template', function () {
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
  it('renders errors', function () {
    ctx.session = {
      error: 'error_name',
      errorDescriptions: ['something went wrong', 'another thing went wrong'],
    }
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });
}); // Authorization Error HTML Template
