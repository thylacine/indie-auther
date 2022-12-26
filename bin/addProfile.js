'use strict';

const DB = require('../src/db');
const Logger = require('../src/logger');
const Config = require('../config');
const config = new Config(process.env.NODE_ENV);

const logger = new Logger(config);
const db = new DB(logger, config);


const identifier = process.argv[2];
const profile = process.argv[3];

if (!identifier) {
  console.log('missing user');
  throw new Error('missing argument');
}
if (!profile) {
  console.log('missing profile');
  throw new Error('missing argument');
}

(async () => {
  await db.initialize();
  await db.context(async (dbCtx) => {
    const user =  await db.authenticationGet(dbCtx, identifier);
    if (!user) {
      console.log('user does not exist');
      throw new Error('invalid identifier');
    }
    const profileURL = new URL(profile); // Validate and normalize
    const result = await db.profileIdentifierInsert(dbCtx, profileURL.href, identifier);
    console.log(result);
  });
  console.log('done');
  await db._closeConnection();
})();
