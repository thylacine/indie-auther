'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Utility functions for wrangling schema migrations.
 * This mostly just deals with sorting and comparing 'x.y.z' version
 * strings, with some presumptions about directory layouts and whatnot.
 */

/**
 * @typedef {object} SchemaVersionObject
 * @property {number} major major
 * @property {number} minor minor
 * @property {number} patch patch
 */


/**
 * Split a dotted version string into parts.
 * @param {string} v version string
 * @returns {SchemaVersionObject} version object
 */
function schemaVersionStringToObject(v) {
  const [ major, minor, patch ] = v.split('.', 3).map((x) => parseInt(x, 10));
  return { major, minor, patch };
}


/**
 * Render a version object numerically.
 * Assumes no part will be greater than 1000.
 * @param {SchemaVersionObject} v version object
 * @returns {number} number
 */
function schemaVersionObjectToNumber(v) {
  const vScale = 1000;
  return parseInt(v.major) * vScale * vScale + parseInt(v.minor) * vScale + parseInt(v.patch);
}


/**
 * Convert dotted version string into number.
 * @param {string} v version string
 * @returns {number} number
 */
function schemaVersionStringToNumber(v) {
  return schemaVersionObjectToNumber(schemaVersionStringToObject(v));
}


/**
 * Version string comparison, for sorting.
 * @param {string} a version string
 * @param {string} b version string
 * @returns {number} cmp
 */
function schemaVersionStringCmp(a, b) {
  return schemaVersionStringToNumber(a) - schemaVersionStringToNumber(b);
}


/**
 * Check if an entry in a directory is a directory containing a migration file.
 * @param {string} schemaDir schema dir
 * @param {string} name name
 * @param {string} migrationFile migration file
 * @returns {boolean} is
 */
function isSchemaMigrationDirectory(schemaDir, name, migrationFile = 'apply.sql') {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const nameStat = fs.statSync(path.join(schemaDir, name));
  if (nameStat.isDirectory()) {
    let applyStat;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      applyStat = fs.statSync(path.join(schemaDir, name, migrationFile));
      return applyStat.isFile();
    } catch (e) { // eslint-disable-line no-unused-vars
      return false;
    }
  }
  return false;
}


/**
 * Return an array of schema migration directory names within engineDir,
 * sorted in increasing order.
 * @param {string} engineDir path to implementation
 * @returns {string[]} versions
 */
function allSchemaVersions(engineDir) {
  const schemaDir = path.join(engineDir, 'sql', 'schema');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const availableVersions = fs.readdirSync(schemaDir).filter((d) => isSchemaMigrationDirectory(schemaDir, d));
  availableVersions.sort(schemaVersionStringCmp);
  return availableVersions;
}


/**
 * Return an array of schema migration directory names within engineDir,
 * which are within supported range, and are greater than the current
 * @param {string} engineDir path to implementation
 * @param {SchemaVersionObject} current version
 * @param {object} supported range of supported versions
 * @param {SchemaVersionObject} supported.min minimum version
 * @param {SchemaVersionObject} supported.max maximum version
 * @returns {string[]} applicable versions
 */
function unappliedSchemaVersions(engineDir, current, supported) {
  const min = schemaVersionObjectToNumber(supported.min);
  const max = schemaVersionObjectToNumber(supported.max);
  const cur = schemaVersionObjectToNumber(current);
  const available = allSchemaVersions(engineDir);
  return available.filter((a) => {
    a = schemaVersionStringToNumber(a);
    return a >= min && a <= max && a > cur;
  });
}


module.exports = {
  schemaVersionStringToObject,
  schemaVersionObjectToNumber,
  schemaVersionStringToNumber,
  schemaVersionStringCmp,
  isSchemaMigrationDirectory,
  allSchemaVersions,
  unappliedSchemaVersions,
};
