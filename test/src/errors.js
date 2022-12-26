/* eslint-env mocha */
'use strict';

const assert = require('assert');
const Errors = require('../../src/errors');

describe('Errors', function () {
  describe('ValidationError', function () {
    it('covers', function () {
      const e = new Errors.ValidationError('message');
      assert.strictEqual(e.name, 'ValidationError');
      assert.strictEqual(e.stack, undefined);
    });
  });
}); // Errors