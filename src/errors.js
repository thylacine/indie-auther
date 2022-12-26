'use strict';

const { Errors } = require('@squeep/api-dingus');

/**
 * A stack-less exception for general data issues.
 */
class ValidationError extends Error {
  constructor(...args) {
    super(...args);
    delete this.stack;
  }

  get name() {
    return this.constructor.name;
  }
}
module.exports = {
  ...Errors,
  ValidationError,
};