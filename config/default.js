'use strict';

// Provide default values for all configuration.

const { name: packageName, version: packageVersion } = require('../package.json');
const common = require('../src/common');
const Enum = require('../src/enum');
const roman = require('@squeep/roman');

const currentYear = (new Date()).getFullYear();
const romanYearHTML = roman.toRoman(currentYear, true);

const defaultOptions = {
  // Uniquely identify this instance.
  nodeId: common.requestId(), // Default to ephemeral ID: easiest for clustered deployments.

  encryptionSecret: '', // No default; set this to a long passphrase or randomness.
  // This may also be set to an array, if secret needs to be rolled. This needs more documentation.

  // Dingus API Server Framework options.
  dingus: {
    // This needs to be the full externally accessible root URL, including any proxyPrefix component.
    selfBaseUrl: '',

    // trustProxy: true, // If true, trust values of some headers regarding client IP address and protocol.
    proxyPrefix: '', // Leading path parts to ignore when parsing routes, and include when constructing links, e.g. /indieauth
  },

  // The terminal portions of API route path endpoints.
  route: {
    static: 'static',
    authorization: 'auth',
    consent: 'consent',
    healthcheck: 'healthcheck',
    introspection: 'introspect',
    metadata: 'meta',
    revocation: 'revoke',
    ticket: 'ticket',
    token: 'token',
    userinfo: 'userinfo',
    admin: 'admin',
    'admin-ticket': 'admin/ticket',
    'admin-maintenance': 'admin/maintenance',
    'auth-login': 'admin/login',
    'auth-logout': 'admin/logout',
    'auth-settings': 'admin/settings',
  },

  // Database options
  db: {
    connectionString: '', // e.g. sqlite://path/to/dbfile.sqlite
    queryLogLevel: undefined, // Set to log queries

    // SQLite specific options
    sqliteOptimizeAfterChanges: 0, // Number of changes before running pragma optimize, 0 for never
  },

  // Queue options, currently only for handing off ticket offers
  queues: {
    amqp: {
      url: undefined, // AMQP endpoint, e.g. 'amqp://user:pass@rmq.host:5672'  If not specified, ticket endpoint will be disabled
      prefix: 'indieauth',
    },
    ticketPublishName: 'ticket.proffered', // exchange to publish proffered tickets to
    ticketRedeemedName: 'ticket.redeemed', // exchange to publish redeemed ticket tokens to
  },

  // Logging options
  logger: {
    ignoreBelowLevel: 'info',
  },

  manager: {
    codeValidityTimeoutMs: 10 * 60 * 1000,
    ticketLifespanSeconds: 300,
    pageTitle: packageName, // title on html pages
    logoUrl: 'static/logo.svg', // image to go with title
    footerEntries: [ // common footers on all html pages
      '<a href="https://git.squeep.com/?p=squeep-indie-auther;a=tree">Development Repository</a>',
      `<span class="copyright">&copy;<time datetime="${currentYear}">${romanYearHTML}</time></span>`,
    ],
    allowLegacyNonPKCE: false, // Whether to process auth requests lacking code challenges
  },

  chores: {
    scopeCleanupMs: 0, // how often to clean up unreferenced scopes, 0 for never
    tokenCleanupMs: 0, // how often to clean up no-longer-valid scopes, 0 for never
    publishTicketsMs: 0, // how often to try to re-publish unpublished redeemed ticket tokens
  },

  // Outgoing request UA header. Setting these here to override helper defaults.
  userAgent: {
    product: packageName,
    version: packageVersion,
    implementation: Enum.Specification,
  },

  authenticator: {
    authnEnabled: ['argon2', 'pam'], // Types of authentication to attempt.
    secureAuthOnly: true, // Require secure transport for authentication.
    forbiddenPAMIdentifiers: [
      'root',
    ],
  },

};

module.exports = defaultOptions;
