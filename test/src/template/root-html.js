/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/root-html');
const Config = require('../../../config');
const StubLogger = require('../../stub-logger');
const { makeHtmlLint } = require('@squeep/html-template-helper');
const { HtmlValidate } = require('html-validate');

const stubLogger = new StubLogger();
const htmlValidate = new HtmlValidate();
const lintHtml = makeHtmlLint(stubLogger, htmlValidate);

describe('Root HTML Template', function () {
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
    config.adminContactHTML = '<div>support</div>';
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
}); // Root HTML Template
