'use strict';

const { common } = require('@squeep/api-dingus');

const { randomBytes } = require('crypto');
const { promisify } = require('util');
const randomBytesAsync = promisify(randomBytes);

/**
 * Pick out useful axios response fields.
 * @param {*} res
 * @returns
 */
const axiosResponseLogData = (res) => {
  const data = common.pick(res, [
    'status',
    'statusText',
    'headers',
    'elapsedTimeMs',
    'data',
  ]);
  if (data.data) {
    data.data = logTruncate(data.data, 100);
  }
  return data;
};

/**
 * Limit length of string to keep logs sane
 * @param {String} str
 * @param {Number} len
 * @returns {String}
 */
const logTruncate = (str, len) => {
  if (typeof str !== 'string' || str.toString().length <= len) {
    return str;
  }
  return str.toString().slice(0, len) + `... (${str.toString().length} bytes)`;
};

/**
 * Turn a snake into a camel.
 * @param {String} snakeCase
 * @param {String|RegExp} delimiter
 * @returns {String}
 */
const camelfy = (snakeCase, delimiter = '_') => {
  if (!snakeCase || typeof snakeCase.split !== 'function') {
    return undefined;
  }
  const words = snakeCase.split(delimiter);
  return [
    words.shift(),
    ...words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)),
  ].join('');
};

/**
 * Return an array containing x if x is not an array.
 * @param {*} x
 */
const ensureArray = (x) => {
  if (x === undefined) {
    return [];
  }
  if (!Array.isArray(x)) {
    return Array(x);
  }
  return x;
};

/**
 * Recursively freeze an object.
 * @param {Object} o 
 * @returns {Object}
 */
const freezeDeep = (o) => {
  Object.freeze(o);
  Object.getOwnPropertyNames(o).forEach((prop) => {
    if (Object.hasOwnProperty.call(o, prop)
    &&  ['object', 'function'].includes(typeof o[prop]) // eslint-disable-line security/detect-object-injection
    &&  !Object.isFrozen(o[prop])) { // eslint-disable-line security/detect-object-injection
      return freezeDeep(o[prop]); // eslint-disable-line security/detect-object-injection
    }
  });
  return o;
};


/** Oauth2.1 §3.2.3.1
 * %x20-21 / %x23-5B / %x5D-7E
 * @param {String} char
 */
const validErrorChar = (char) => {
  const value = char.charCodeAt(0);
  return value === 0x20 || value === 0x21
    || (value >= 0x23 && value <= 0x5b)
    || (value >= 0x5d && value <= 0x7e);
};


/**
 * Determine if an OAuth error message is valid.
 * @param {String} error
 * @returns {Boolean}
 */
const validError = (error) => {
  return error && error.split('').filter((c) => !validErrorChar(c)).length === 0 || false;
};


/**
 * OAuth2.1 §3.2.2.1
 * scope-token = 1*( %x21 / %x23-5B / %x5D-7E )
 * @param {String} char
 */
const validScopeChar = (char) => {
  const value = char.charCodeAt(0);
  return value === 0x21
    || (value >= 0x23 && value <= 0x5b)
    || (value >= 0x5d && value <= 0x7e);
};


/**
 * Determine if a scope has a valid name.
 * @param {String} scope
 * @returns {Boolean}
 */
const validScope = (scope) => {
  return scope && scope.split('').filter((c) => !validScopeChar(c)).length === 0 || false;
};


/**
 * 
 * @param {Number} bytes
 */
const newSecret = async (bytes = 64) => {
  return (await randomBytesAsync(bytes * 3 / 4)).toString('base64');
};


/**
 * Convert a Date object to epoch seconds.
 * @param {Date=} date
 * @returns {Number}
 */
const dateToEpoch = (date) => {
  const dateMs = date ? date.getTime() : Date.now();
  return Math.ceil(dateMs / 1000);
};

module.exports = {
  ...common,
  axiosResponseLogData,
  camelfy,
  dateToEpoch,
  ensureArray,
  freezeDeep,
  logTruncate,
  newSecret,
  randomBytesAsync,
  validScope,
  validError,
};

