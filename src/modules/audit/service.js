import { AuditLog } from './model.js';
import { logger } from '../../utils/logger.js';

/**
 * Writes an audit entry. Auditing must never break the business operation,
 * so failures are logged and swallowed.
 */
export async function audit({
  action,
  entityType = null,
  entityId = null,
  before = null,
  after = null,
  actorId = null,
  req = null,
  note = null,
}) {
  try {
    await AuditLog.create({
      actor: actorId,
      action,
      entityType,
      entityId,
      before,
      after,
      metadata: {
        ip: req?.ip ?? null,
        userAgent: req?.headers?.['user-agent'] ?? null,
        requestId: req?.id ?? null,
        note,
      },
    });
  } catch (error) {
    logger.error({ err: error, action }, 'Failed to write audit log');
  }
}
