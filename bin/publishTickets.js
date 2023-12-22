'use strict';

const DB = require('../src/db');
const Logger = require('../src/logger');
const Config = require('../config');
const config = new Config(process.env.NODE_ENV, false);
const Chores = require('../src/chores');
const { Publisher: QueuePublisher } = require('@squeep/amqp-helper');

const logger = new Logger(config);
const db = new DB(logger, config);

(async () => {
  if (!config.queues.amqp.url) {
    console.log('no queue configured, nothing to do');
    return;
  }
  await db.initialize();
  const queuePublisher = new QueuePublisher(logger, config.queues.amqp);
  // no automatic chores
  config.chores.tokenCleanupMs = 0;
  config.chores.scopeCleanupMs = 0;
  config.chores.publishTicketsMs = 0;
  const chores = new Chores(logger, db, queuePublisher, config);

  await chores.publishTickets();

  console.log('done');
  await db._closeConnection();
})();
