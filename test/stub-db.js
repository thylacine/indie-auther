'use strict';

const { StubDatabase: Base } = require('@squeep/test-helper');
const sinon = require('sinon');

class StubDatabase extends Base {
  constructor() {
    super(sinon);
  }

  get _stubFns() {
    return [
      ...super._stubFns,
      'almanacGetAll',
      'almanacUpsert',
      'authenticationGet',
      'authenticationSuccess',
      'authenticationUpsert',
      'authenticationUpdateCredential',
      'authenticationUpdateOTPKey',
      'profileIdentifierInsert',
      'profileIsValid',
      'profileScopeInsert',
      'profileScopesSetAll',
      'profilesScopesByIdentifier',
      'redeemCode',
      'refreshCode',
      'resourceGet',
      'resourceUpsert',
      'scopeCleanup',
      'scopeDelete',
      'scopeUpsert',
      'tokenCleanup',
      'tokenGetByCodeId',
      'tokenRefreshRevokeByCodeId',
      'tokenRevokeByCodeId',
      'tokensGetByIdentifier',
      'ticketRedeemed',
      'ticketTokenPublished',
      'ticketTokenGetUnpublished',
    ];
  }
}

module.exports = StubDatabase;
