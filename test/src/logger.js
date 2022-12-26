/* eslint-env mocha */
'use strict';

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line node/no-unpublished-require
const Logger = require('../../src/logger');
const Config = require('../../config');

describe('Logger', function () {
  let config;
  let logger;

  beforeEach(function () {
    config = new Config('test');
    logger = new Logger(config);
    Object.keys(Logger.nullLogger).forEach((level) => sinon.stub(logger.backend, level));
  });

  afterEach(function () {
    sinon.restore();
  });

  it('logs', function () {
    logger.info('testScope', 'message', { baz: 'quux' }, { foo: 1 }, 'more other');
    assert(logger.backend.info.called);
  });

  it('logs BigInts', function () {
    logger.info('testScope', 'message', { aBigInteger: BigInt(2) });
    assert(logger.backend.info.called);
    assert(logger.backend.info.args[0][0].includes('"2"'));
  });

  it('logs Errors', function () {
    logger.error('testScope', 'message', { e: new Error('an error') });
    assert(logger.backend.error.called);
    assert(logger.backend.error.args[0][0].includes('an error'));
  });

  it('masks credentials', function () {
    logger.info('testScope', 'message', {
      ctx: {
        parsedBody: {
          identity: 'username',
          credential: 'password',
        },
      },
    });
    assert(logger.backend.info.called);
    assert(logger.backend.info.args[0][0].includes('"username"'));
    assert(logger.backend.info.args[0][0].includes('"********"'));
  });

  it('strips uninteresting scope dross', function () {
    logger.info('testScope', 'message', {
      ctx: {
        profilesScopes: {
          profileScopes: {
            'https://thuza.ratfeathers.com/': {
              profile: {
                description: 'Access detailed profile information, including name, image, and url.',
                application: 'IndieAuth',
                profiles: [
                  'https://thuza.ratfeathers.com/',
                ],
                isPermanent: true,
                isManuallyAdded: false,
              },
            },
          },
          scopeIndex: {
            profile: {
              description: 'Access detailed profile information, including name, image, and url.',
              application: 'IndieAuth',
              profiles: [
                'https://thuza.ratfeathers.com/',
              ],
              isPermanent: true,
              isManuallyAdded: false,
            },
            email: {
              description: 'Include email address with detailed profile information.',
              application: 'IndieAuth',
              profiles: [],
              isPermanent: true,
              isManuallyAdded: false,
            },
          },
        },
      },
    });
    assert(logger.backend.info.called);
  });

  it('strips uninteresting scope dross from session', function () {
    logger.info('testScope', 'message', {
      ctx: {
        session: {
          profileScopes: {
            'https://thuza.ratfeathers.com/': {
              profile: {
                description: 'Access detailed profile information, including name, image, and url.',
                application: 'IndieAuth',
                profiles: [
                  'https://thuza.ratfeathers.com/',
                ],
                isPermanent: true,
                isManuallyAdded: false,
              },
            },
          },
          scopeIndex: {
            profile: {
              description: 'Access detailed profile information, including name, image, and url.',
              application: 'IndieAuth',
              profiles: [
                'https://thuza.ratfeathers.com/',
              ],
              isPermanent: true,
              isManuallyAdded: false,
            },
            email: {
              description: 'Include email address with detailed profile information.',
              application: 'IndieAuth',
              profiles: [],
              isPermanent: true,
              isManuallyAdded: false,
            },
          },
        },
      },
    });
    assert(logger.backend.info.called);
  });

}); // Logger
