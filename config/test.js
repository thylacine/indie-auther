'use strict';
// Configuration used by test suites.
module.exports = {
  encryptionSecret: 'not a great secret',
  dingus: {
    selfBaseUrl: 'https://example.com/indieauthie/',
  },
  db: {
    queryLogLevel: 'debug',
  },
  queues: {
    amqp: {
      url: 'amqp://localhost:5432',
    },
  },
};
