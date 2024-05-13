'use strict';

const common = require('./common');
const Enum = require('./enum');
const { Chores: BaseChores } = require('@squeep/chores');
const _fileScope = common.fileScope(__filename);

/**
 * Wrangle periodic tasks what need doing.
 */

class Chores extends BaseChores {
  constructor(logger, db, queuePublisher, options) {
    super(logger);
    this.options = options;
    this.db = db;
    this.queuePublisher = queuePublisher;

    this.establishChore(Enum.Chore.CleanTokens, this.cleanTokens.bind(this), options?.chores?.tokenCleanupMs);
    this.establishChore(Enum.Chore.CleanScopes, this.cleanScopes.bind(this), options?.chores?.scopeCleanupMs);
    this.establishChore(Enum.Chore.PublishTickets, this.publishTickets.bind(this), options?.chores?.publishTicketsMs);
  }

  /**
   * Attempt to remove tokens which are expired or otherwise no longer valid.
   * @param {number} atLeastMsSinceLast minimum clean period
   */
  async cleanTokens(atLeastMsSinceLast = this.options?.chores?.tokenCleanupMs || 0) {
    const _scope = _fileScope('cleanTokens');
    this.logger.debug(_scope, 'called', { atLeastMsSinceLast });

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
   * @param {number} atLeastMsSinceLast minimum clean period
   */
  async cleanScopes(atLeastMsSinceLast = this.options?.chores?.scopeCleanupMs || 0) {
    const _scope = _fileScope('cleanScopes');
    this.logger.debug(_scope, 'called', { atLeastMsSinceLast });

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


  /**
   * Attempt to deliver any redeemed but un-delivered ticket tokens.
   */
  async publishTickets() {
    const _scope = _fileScope('publishTickets');
    this.logger.debug(_scope, 'called');

    try {
      const queueName = this.options.queues.ticketRedeemedName;
      await this.db.context(async (dbCtx) => {
        const ticketTokens = await this.db.ticketTokenGetUnpublished(dbCtx);
        for await (const data of ticketTokens) {
          try {
            const result = await this.queuePublisher.publish(queueName, data);
            this.logger.info(_scope, 'published ticket token', { queueName, result, ...data });
            const redeemedData = common.pick(data, ['resource', 'subject', 'iss', 'ticket', 'token']);
            await this.db.ticketTokenPublished(dbCtx, redeemedData);
          } catch (e) {
            this.logger.error(_scope, 'publish failed', { error: e, data });
          }
        }
      }); // dbCtx
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      throw e;
    }
  }
} // Chores

module.exports = Chores;
