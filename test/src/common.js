/* eslint-env mocha */
'use strict';

const assert = require('assert');
const sinon = require('sinon');
const StubLogger = require('../stub-logger');
const common = require('../../src/common');

describe('Common', function () {
  
  describe('camelfy', function () {
    it('covers', function () {
      const snake = 'snake_case';
      const expected = 'snakeCase';
      const result = common.camelfy(snake);
      assert.strictEqual(result, expected);
    });
    it('covers edge-cases', function () {
      const kebab = '-kebab-case-';
      const expected = 'KebabCase';
      const result = common.camelfy(kebab, '-');
      assert.strictEqual(result, expected);
    });
    it('covers empty input', function () {
      const empty = '';
      const expected = undefined;
      const result = common.camelfy(empty);
      assert.strictEqual(result, expected);
    });
    it('covers un-camelfiable input', function () {
      const bad = {};
      const expected = undefined;
      const result = common.camelfy(bad);
      assert.strictEqual(result, expected);
    });
  }); // camelfy

  describe('freezeDeep', function () {
    it('freezes things', function () {
      const obj = {
        sub1: {
          sub2: {
            foo: 'blah',
          },
        },
      };
      const result = common.freezeDeep(obj);
      assert(Object.isFrozen(result));
      assert(Object.isFrozen(result.sub1));
      assert(Object.isFrozen(result.sub1.sub2));
      assert(Object.isFrozen(result.sub1.sub2.foo));
    });
  }); // freezeDeep

  describe('axiosResponseLogData', function () {
    it('covers', function () {
      const response = {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'text/plain',
        },
        otherData: 'blah',
        data: 'Old Mother West Wind had stopped to talk with the Slender Fir Tree. "I\'ve just come across the Green Meadows," said Old Mother West Wind, “and there I saw the Best Thing in the World.”',
      };
      const expected = {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'text/plain',
        },
        data: 'Old Mother West Wind had stopped to talk with the Slender Fir Tree. "I\'ve just come across the Green... (184 bytes)',
      };
      const result = common.axiosResponseLogData(response);
      assert.deepStrictEqual(result, expected);
    });
    it('covers no data', function () {
      const response = {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'text/plain',
        },
      };
      const expected = {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'text/plain',
        },
      };
      const result = common.axiosResponseLogData(response);
      assert.deepStrictEqual(result, expected);
    });
  }); // axiosResponseLogData

  describe('logTruncate', function () {
    it('returns short string', function () {
      const str = 'this is a short string';
      const result = common.logTruncate(str, 100);
      assert.strictEqual(result, str);
    });
    it('truncates long string', function () {
      const str = 'this is not really a very long string but it is long enough for this test';
      const result = common.logTruncate(str, 10);
      assert(result.length < str.length);
    });
  }); // logTruncate

  describe('ensureArray', function () {
    it('returns empty array for no data', function () {
      const result = common.ensureArray();
      assert.deepStrictEqual(result, []);
    });
    it('returns same array passed in', function () {
      const expected = [1, 2, 3, 'foo'];
      const result = common.ensureArray(expected);
      assert.deepStrictEqual(result, expected);
    });
    it('returns array containing non-array data', function () {
      const data = 'bar';
      const result = common.ensureArray(data);
      assert.deepStrictEqual(result, [data]);
    });
  }); // ensureArray

  describe('validError', function () {
    it('covers valid', function () {
      const result = common.validError('error');
      assert.strictEqual(result, true);
    });
    it('covers invalid', function () {
      const result = common.validError('🐔');
      assert.strictEqual(result, false);
    });
    it('covers empty', function () {
      const result = common.validError();
      assert.strictEqual(result, false);
    });
  }); // validError

  describe('validScope', function () {
    it('covers valid', function () {
      const result = common.validScope('scope');
      assert.strictEqual(result, true);
    });
    it('covers invalid', function () {
      const result = common.validScope('🐔');
      assert.strictEqual(result, false);
    });
    it('covers empty', function () {
      const result = common.validScope();
      assert.strictEqual(result, false);
    });
  }); // validScope

  describe('newSecret', function () {
    it('covers default', async function () {
      const result = await common.newSecret();
      assert(result.length);
    });
    it('covers specified', async function () {
      const result = await common.newSecret(21);
      assert(result.length);
    });
  }); // newSecret

  describe('dateToEpoch', function () {
    it('covers no supplied date', function () {
      const nowMs = Date.now() / 1000;
      const result = common.dateToEpoch();
      const drift = Math.abs(result - nowMs);
      assert(drift < 2000);
    });
    it('covers supplied date', function () {
      const now = new Date();
      const nowEpoch = Math.ceil(now / 1000);
      const result = common.dateToEpoch(now);
      assert.strictEqual(result, nowEpoch);
    });
  }); // dateToEpoch

  describe('omit', function () {
    it('covers', function () {
      const obj = {
        foo: true,
        bar: 'bar',
        baz: {
          quux: false,
        },
      };
      const omitted = ['bar', 'baz'];
      const expected = {
        foo: true,
      };
      const result = common.omit(obj, omitted);
      assert.deepStrictEqual(result, expected);
    });
  }); // omit

  describe('mysteryBoxLogger', function () {
    let mbl, stubLogger;
    beforeEach(function () {
      stubLogger = new StubLogger();
      stubLogger._reset();
      mbl = common.mysteryBoxLogger(stubLogger, 'test:scope');
    });
    afterEach(function () {
      sinon.restore();
    });
    it('covers', function () {
      const stat = {
        packageName: 'fake-mystery-box',
        packageVersion: '0.0.0',
        data: 'exists',
      };
      mbl(stat);
      assert(stubLogger.debug.called);
    });
  }); // mysteryBoxLogger

}); // Common
