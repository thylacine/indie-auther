'use strict';


/**
 * 
 * @param {String} option
 * @returns {*}
 */
function getOption(option) {
  let value;
  while (process.argv.includes(option)) {
    const optionIndex = process.argv.indexOf(option);
    value = process.argv.splice(optionIndex, 2)[1];
  }
  return value;
}


/**
 * 
 * @param {String} flag
 * @returns {Number}
 */
function getFlag(flag) {
  let value = 0;
  while (process.argv.includes(flag)) {
    const flagIndex = process.argv.indexOf(flag);
    process.argv.splice(flagIndex, 1);
    value += 1;
  }
  return value;
}


module.exports = {
  getFlag,
  getOption,
};