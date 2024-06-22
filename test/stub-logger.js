'use strict';

const { StubLogger: Base } = require('@squeep/test-helper');
const sinon = require('sinon');


class StubLogger extends Base {
  constructor(verbose) {
    super(sinon, verbose);
  }
}

module.exports = StubLogger;
