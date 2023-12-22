'use strict';
const common = require('./common');
const { Enum } = require('@squeep/api-dingus');

common.mergeEnum(Enum, {
  Specification: 'living-standard-20220212',

  ContentType: {
    ApplicationOctetStream: 'application/octet-stream',
  },

  Header: {
    Authorization: 'Authorization',
    Link: 'Link',
    Location: 'Location',
    Pragma: 'Pragma',
    UserAgent: 'User-Agent',
    WWWAuthenticate: 'WWW-Authenticate',
  },

  Chore: {
    CleanTokens: 'cleanTokens',
    CleanScopes: 'cleanScopes',
    PublishTickets: 'publishTickets',
  },

  AlmanacEntry: {
    TokenCleanup: 'tokenCleanup',
    ScopeCleanup: 'scopeCleanup',
    TicketPublished: 'ticketPublished',
  },
});

module.exports = Enum;
