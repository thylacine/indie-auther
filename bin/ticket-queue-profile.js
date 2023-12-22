'use strict';

/**
 * Generates the required command line to configure rabbitmq queue profile.
 */

const { Publisher } = require('@squeep/amqp-helper');
const Config = require('../config');

const config = new Config(process.env.NODE_ENV);
const publisher = new Publisher(console, config.queues.amqp);
const result = publisher.policyCommand(config.queues.ticketPublishName);
console.log(result);
