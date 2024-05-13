'use strict';

const { StubDatabase: Base } = require('@squeep/test-helper');

class StubDatabase extends Base {
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
