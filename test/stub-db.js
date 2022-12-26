/* eslint-disable security/detect-object-injection */
'use strict';

const { StubDatabase: Base } = require('@squeep/test-helper'); // eslint-disable-line node/no-unpublished-require

class StubDatabase extends Base {
  get _stubFns() {
    return [
      ...super._stubFns,
      'almanacGetAll',
      'authenticationGet',
      'authenticationSuccess',
      'authenticationUpsert',
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
    ];
  }
}

module.exports = StubDatabase;