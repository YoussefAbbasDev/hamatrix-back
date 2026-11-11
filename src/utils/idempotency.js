import crypto from 'node:crypto';
import { ERROR_CODES } from './errorCodes.js';
import { IdempotencyKey } from '../modules/core/idempotency.model.js';
import { errors } from './errors.js';

const TTL_MS = 24 * 60 * 60 * 1000;

function hashBody(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
}

function replay(existing, requestHash) {
  if (existing.requestHash !== requestHash) {
    throw errors.conflict(
      ERROR_CODES.IDEMPOTENCY_MISMATCH,
      'تم استخدام مفتاح التكرار نفسه لطلب مختلف',
    );
  }
  if (existing.status !== 'completed') {
    throw errors.conflict(
      ERROR_CODES.IDEMPOTENCY_IN_PROGRESS,
      'الطلب قيد التنفيذ بالفعل، انتظر لحظة ثم أعد المحاولة',
    );
  }
  return {
    status: existing.responseStatus,
    body: existing.responseBody,
    replayed: true,
    resourceId: existing.resourceId,
  };
}

/**
 * BR-20 / BR-68: runs `fn()` at most once per (user, scope, Idempotency-Key).
 * `fn` returns `{ status, body, resourceId? }`; the response is stored so a
 * replay returns exactly the same payload.
 */
export async function runIdempotent(req, scope, fn) {
  const key = String(req.get('Idempotency-Key') || '').trim();
  if (!key) {
    throw errors.validation([
      { path: 'Idempotency-Key', message: 'ترويسة Idempotency-Key مطلوبة لهذه العملية' },
    ]);
  }
  if (key.length < 8 || key.length > 120) {
    throw errors.validation([
      { path: 'Idempotency-Key', message: 'طول المفتاح يجب أن يكون بين 8 و120 حرفًا' },
    ]);
  }

  const user = req.admin._id;
  const requestHash = hashBody(req.body);

  let existing = await IdempotencyKey.findOne({ user, scope, key }).lean();
  if (existing) return replay(existing, requestHash);

  try {
    await IdempotencyKey.create({
      user,
      scope,
      key,
      requestHash,
      expiresAt: new Date(Date.now() + TTL_MS),
    });
  } catch (error) {
    if (error?.code === 11000) {
      existing = await IdempotencyKey.findOne({ user, scope, key }).lean();
      if (existing) return replay(existing, requestHash);
    }
    throw error;
  }

  try {
    const result = await fn();
    await IdempotencyKey.updateOne(
      { user, scope, key },
      {
        $set: {
          status: 'completed',
          responseStatus: result.status,
          responseBody: result.body,
          resourceId: result.resourceId ?? null,
        },
      },
    );
    return { ...result, replayed: false };
  } catch (error) {
    await IdempotencyKey.deleteOne({ user, scope, key, status: 'in_progress' });
    throw error;
  }
}
