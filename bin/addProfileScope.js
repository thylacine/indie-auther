'use strict';

const DB = require('../src/db');
const Logger = require('../src/logger');
const Config = require('../config');
const config = new Config(process.env.NODE_ENV);

const logger = new Logger(config);
const db = new DB(logger, config);


const profile = process.argv[2];
const scope = process.argv[3];

if (!scope) {
  console.log('missing scope');
  throw new Error('missing argument');
}
if (!profile) {
  console.log('missing profile');
  throw new Error('missing argument');
}

(async () => {
  await db.initialize();
  await db.context(async (dbCtx) => {
    const result = await db.profileScopeInsert(dbCtx, profile, scope);
    console.log(result);
  });
  console.log('done');
  await db._closeConnection();
})();
