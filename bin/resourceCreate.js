'use strict';

const cli = require('./cli-helper');
const DB = require('../src/db');
const Logger = require('../src/logger');
const Config = require('../config');
const { newSecret } = require('../src/common');
const config = new Config(process.env.NODE_ENV, false);
const verbose = cli.getFlag('-v');
if (!verbose) {
  config.logger.ignoreBelowLevel = 'info';
}
const logger = new Logger(config);
const db = new DB(logger, config);


const resourceId = cli.getOption('-i');
let secret = cli.getOption('-s');
const rest = process.argv.slice(2);
const description = rest.length ? rest.join(' ') : undefined;

(async () => {
  await db.initialize();
  try {
    if (!resourceId) {
      if (!description || !description.length) {
        console.log('ERROR: description is required when creating a new resource.');
        throw new Error('Invalid parameters');
      }
      if (!secret) {
        secret = await newSecret();
      }
    }

    await db.context(async (dbCtx) => {
      const result = await db.resourceUpsert(dbCtx, resourceId, secret, description);
      console.log(result);
    });
  } catch (e) {
    console.log(e);
  } finally {
    await db._closeConnection();
  }
})().then(() => {
  console.log('done');
});
