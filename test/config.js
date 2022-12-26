/* eslint-env mocha */
'use strict';

const assert = require('assert');
const Config = require('../config');

describe('Config', function () {
  it('covers default environment', function () {
    const config = new Config();
    assert.strictEqual(config.environment, 'development');
    assert(Object.isFrozen(config));
  });
  it('covers default environment, unfrozen', function () {
    const config = new Config(undefined, false);
    assert.strictEqual(config.environment, 'development');
    assert(!Object.isFrozen(config));
  });
  it('covers test environment', function () {
    const config = new Config('test');
    assert.strictEqual(config.environment, 'test');
    assert(!Object.isFrozen(config));
  });
}); // Config