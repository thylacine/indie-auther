'use strict';
module.exports = [
  {
    authenticator: {
      authnEnabled: undefined, // remove all, then set one below
    },
  },
  {
    encryptionSecret: 'this is not a very good secret',
    db: {
      connectionString: `postgresql://${encodeURIComponent('/var/lib/postgresql/14/data')}/indieauther`, // local pg socket
      queryLogLevel: 'debug',
    },
    dingus: {
      selfBaseUrl: 'https://ia.squeep.com/',
    },
    queues: {
      amqp: {
        url: 'amqp://guest:guest@rmq.int:5672',
      },
    },
    logger: {
      ignoreBelowLevel: 'debug',
    },
    authenticator: {
      authnEnabled: ['argon2'],
    },
    chores: {
      scopeCleanupMs: 86400000,
      tokenCleanupMs: 86400000,
    },
    manager: {
      allowLegacyNonPKCE: true,
    },
  },
];
