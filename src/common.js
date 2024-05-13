'use strict';

const { common } = require('@squeep/api-dingus');

const { randomBytes } = require('node:crypto');
const { promisify } = require('node:util');
const randomBytesAsync = promisify(randomBytes);

/**
 * Limit length of string to keep logs sane
 * @param {string} str str
 * @param {number} len len
 * @returns {string} str
 */
const logTruncate = (str, len) => {
  if (typeof str !== 'string' || str.toString().length <= len) {
    return str;
  }
  return str.toString().slice(0, len) + `... (${str.toString().length} bytes)`;
};

/**
 * Turn a snake into a camel.
 * @param {string} snakeCase snake case
 * @param {string | RegExp} delimiter delimiter
 * @returns {string} camel case
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
 * @param {*} x x
 * @returns {any[]} x[]
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
 * @param {object} o obj
 * @returns {object} frozen obj
 */
const freezeDeep = (o) => {
  Object.freeze(o);
  Object.getOwnPropertyNames(o).forEach((prop) => {
    if (Object.hasOwn(o, prop)
    &&  ['object', 'function'].includes(typeof o[prop]) // eslint-disable-line security/detect-object-injection
    &&  !Object.isFrozen(o[prop])) { // eslint-disable-line security/detect-object-injection
      return freezeDeep(o[prop]); // eslint-disable-line security/detect-object-injection
    }
  });
  return o;
};


/**
 * Oauth2.1 §3.2.3.1
 * %x20-21 / %x23-5B / %x5D-7E
 * ' '-'!' / '#'-'[' / ']'-'~'
 * not allowed: control characters, '"', '\'
 * @param {string} char character
 * @returns {boolean} is valid
 */
const validErrorChar = (char) => {
  const value = char.charCodeAt(0);
  return value === 0x20 || value === 0x21
    || (value >= 0x23 && value <= 0x5b)
    || (value >= 0x5d && value <= 0x7e);
};


/**
 * Determine if an OAuth error message is valid.
 * @param {string} error error
 * @returns {boolean} is valid
 */
const validError = (error) => {
  return error && error.split('').filter((c) => !validErrorChar(c)).length === 0 || false;
};


/**
 * OAuth2.1 §3.2.2.1
 * scope-token = 1*( %x21 / %x23-5B / %x5D-7E )
 * @param {string} char char
 * @returns {boolean} is valid
 */
const validScopeChar = (char) => {
  const value = char.charCodeAt(0);
  return value === 0x21
    || (value >= 0x23 && value <= 0x5b)
    || (value >= 0x5d && value <= 0x7e);
};


/**
 * Determine if a scope has a valid name.
 * @param {string} scope scope
 * @returns {boolean} is valid
 */
const validScope = (scope) => {
  return scope && scope.split('').filter((c) => !validScopeChar(c)).length === 0 || false;
};


/**
 * 
 * @param {number} bytes bytes
 * @returns {string} base64 random string
 */
const newSecret = async (bytes = 64) => {
  return (await randomBytesAsync(bytes * 3 / 4)).toString('base64');
};


/**
 * Convert a Date object to epoch seconds.
 * @param {Date=} date date
 * @returns {number} epoch
 */
const dateToEpoch = (date) => {
  const dateMs = date ? date.getTime() : Date.now();
  return Math.ceil(dateMs / 1000);
};


const omit = (o, props) => {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !props.includes(k)));
};


/**
 * @typedef {object} ConsoleLike
 * @property {Function} debug log debug
 */

/**
 * Log Mystery Box statistics events.
 * @param {ConsoleLike} logger logger instance
 * @param {string} scope scope
 * @returns {Function} stat logger
 */
const mysteryBoxLogger = (logger, scope) => {
  return (s) => {
    logger.debug(scope, `${s.packageName}@${s.packageVersion}:${s.method}`, omit(s, [
      'packageName',
      'packageVersion',
      'method',
    ]));
  };
};


const nop = () => { /**/ };

module.exports = {
  ...common,
  camelfy,
  dateToEpoch,
  ensureArray,
  freezeDeep,
  logTruncate,
  mysteryBoxLogger,
  newSecret,
  omit,
  randomBytesAsync,
  validScope,
  validError,
  nop,
};

