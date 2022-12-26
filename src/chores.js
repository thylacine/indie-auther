'use strict';

const common = require('./common');
const Enum = require('./enum');
const { Chores: BaseChores } = require('@squeep/chores');
const _fileScope = common.fileScope(__filename);

/**
 * Wrangle periodic tasks what need doing.
 */

class Chores extends BaseChores {
  constructor(logger, db, options) {
    super(logger);
    this.options = options;
    this.db = db;

    this.establishChore(Enum.Chore.CleanTokens, this.cleanTokens.bind(this), options?.chores?.tokenCleanupMs);
    this.establishChore(Enum.Chore.CleanScopes, this.cleanScopes.bind(this), options?.chores?.scopeCleanupMs);
  }

  /**
   * Attempt to remove tokens which are expired or otherwise no longer valid.
   * @param {Number} atLeastMsSinceLast
   */
  async cleanTokens(atLeastMsSinceLast = this.options?.chores?.tokenCleanupMs || 0) {
    const _scope = _fileScope('cleanTokens');
    this.logger.debug(_scope, 'called', atLeastMsSinceLast);

    let tokensCleaned;
    try {
      await this.db.context(async (dbCtx) => {
        const codeValidityTimeoutSeconds = Math.ceil(this.options.manager.codeValidityTimeoutMs / 1000);
        tokensCleaned = await this.db.tokenCleanup(dbCtx, codeValidityTimeoutSeconds, atLeastMsSinceLast);
      }); // dbCtx
      if (tokensCleaned) {
        this.logger.info(_scope, 'finished', { tokensCleaned });
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      throw e;
    }
  }


  /**
   * Attempt to remove ephemeral scopes which are no longer referenced by tokens.
   * @param {Number} atLeastMsSinceLast
   */
  async cleanScopes(atLeastMsSinceLast = this.options?.chores?.scopeCleanupMs || 0) {
    const _scope = _fileScope('cleanScopes');
    this.logger.debug(_scope, 'called', atLeastMsSinceLast);

    let scopesCleaned;
    try {
      await this.db.context(async (dbCtx) => {
        scopesCleaned = await this.db.scopeCleanup(dbCtx, atLeastMsSinceLast);
      }); // dbCtx
      if (scopesCleaned) {
        this.logger.info(_scope, 'finished', { scopesCleaned });
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      throw e;
    }
  }

} // IAChores

module.exports = Chores;