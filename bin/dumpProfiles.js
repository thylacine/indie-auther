'use strict';

const DB = require('../src/db');
const Logger = require('../src/logger');
const Config = require('../config');
const config = new Config(process.env.NODE_ENV);

const logger = new Logger(config);
const db = new DB(logger, config);


const identifier = process.argv[2];

if (!identifier) {
  console.log('missing user');
  throw new Error('missing argument');
}

(async () => {
  await db.initialize();
  await db.context(async (dbCtx) => {
    const user =  await db.authenticationGet(dbCtx, identifier);

    const profiles = await db.profilesByIdentifier(dbCtx, identifier);
    console.log(profiles);
    if (!user) {
      console.log('(user does not exist)');
    }
  }); // dbCtx
  console.log('done');
  await db._closeConnection();
})();
