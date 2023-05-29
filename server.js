'use strict';

const http = require('node:http');
const { AsyncLocalStorage } = require('node:async_hooks');

const Config = require('./config');
const DB = require('./src/db');
const Service = require('./src/service');
const Logger = require('./src/logger');
const { fileScope } = require('./src/common');
const _fileScope = fileScope(__filename);
const { version } = require('./package.json');

const PORT = process.env.PORT || 3002;
const ADDR = process.env.LISTEN_ADDR || '127.0.0.1';

(async function main () {
  const _scope = _fileScope('main');
  let config, logger, db, service;
  try {
    const asyncLocalStorage = new AsyncLocalStorage();
    config = new Config(process.env.NODE_ENV);
    logger = new Logger(config.logger, { nodeId: config.nodeId }, asyncLocalStorage);
    db = new DB(logger, config);
    await db.initialize();
    service = new Service(logger, db, config, asyncLocalStorage);
    await service.initialize();

    http.createServer(async (req, res) => {
      await asyncLocalStorage.run({}, async () => {
        await service.dispatch(req, res);
      });
    }).listen(PORT, ADDR, (err) => {
      if (err) {
        logger.error(_scope, 'error starting server', err);
        throw err;
      }
      logger.info(_scope, 'server started', { version, listenAddress: ADDR, listenPort: PORT });
    });
  } catch (e) {
    (logger || console).error(_scope, 'error starting server', e);
  }
})();
