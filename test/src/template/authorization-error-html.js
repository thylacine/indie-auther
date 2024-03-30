/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/authorization-error-html');
const Config = require('../../../config');
const StubLogger = require('../../stub-logger');
const { makeHtmlLint } = require('@squeep/html-template-helper');
const { HtmlValidate } = require('html-validate');

const stubLogger = new StubLogger();
const htmlValidate = new HtmlValidate();
const lintHtml = makeHtmlLint(stubLogger, htmlValidate);

describe('Authorization Error HTML Template', function () {
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
  it('renders errors', async function () {
    ctx.session = {
      error: 'error_name',
      errorDescriptions: ['something went wrong', 'another thing went wrong'],
    }
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
}); // Authorization Error HTML Template
