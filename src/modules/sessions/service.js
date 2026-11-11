import { BILLING_MODE, DEVICE_STATUS, SESSION_STATUS } from '../../utils/enums.js';
import { ERROR_CODES } from '../../utils/errorCodes.js';
import { Session } from './model.js';
import { Device } from '../devices/model.js';
import { Visit } from '../visits/model.js';
import { createVisitDoc } from '../visits/service.js';
import { getSettings } from '../settings/service.js';
import { errors } from '../../utils/errors.js';
import { withTransaction } from '../../utils/txn.js';
import { nextSequence, formatDocumentNumber, monthPeriod } from '../../utils/ids.js';
import { resolveSort, paginationMeta } from '../../utils/validation.js';
import { emitEvent, SOCKET_EVENTS } from '../../sockets/events.js';
import { presentSession } from './presenter.js';
import { endSessionDoc, pauseSessionDoc, resumeSessionDoc } from './lifecycle.js';

function presentSessionDetail(session, visit = null) {
  return {
    session: presentSession(session),
    visit: visit
      ? {
          id: String(visit._id),
          visitNumber: visit.visitNumber,
          playerName: visit.playerName ?? '',
          status: visit.status,
          openedAt: visit.openedAt,
          invoiceId: visit.invoice ? String(visit.invoice) : null,
        }
      : null,
  };
}

function resolveRate(device, pricingOptionKey) {
  if (!pricingOptionKey) {
    return { ratePerHourMinor: device.hourlyPriceMinor, option: null };
  }
  const option = (device.pricingOptions ?? []).find(
    (candidate) => candidate.key.toLowerCase() === String(pricingOptionKey).toLowerCase(),
  );
  if (!option) {
    throw errors.business(
      ERROR_CODES.INVALID_PRICING_OPTION,
      'خيار التسعير غير موجود على هذا الجهاز',
      { pricingOptionKey },
    );
  }
  return { ratePerHourMinor: option.pricePerHourMinor, option };
}

function deviceConflict(device) {
  if (device.status === DEVICE_STATUS.MAINTENANCE) {
    return errors.conflict(ERROR_CODES.DEVICE_MAINTENANCE, 'الجهاز في الصيانة');
  }
  if (device.status === DEVICE_STATUS.OCCUPIED) {
    return errors.conflict(ERROR_CODES.DEVICE_OCCUPIED, 'الجهاز مشغول بجلسة أخرى');
  }
  return errors.conflict(ERROR_CODES.DEVICE_NOT_AVAILABLE, 'الجهاز غير متاح للبدء');
}

/**
 * BR-33 → BR-34 / BR-D18: starts a session, snapshots the rate, flips the
 * device to occupied and links the session to the visit — atomically.
 */
export async function startSession(input, actorId) {
  const settings = await getSettings();
  const now = new Date();

  const billingMode = input.billingMode ?? BILLING_MODE.OPEN;
  let targetActiveMinutes = null;

  if (billingMode === BILLING_MODE.FIXED) {
    const max = settings.session?.maxDurationMinutes ?? 720;
    if (input.durationMinutes > max) {
      throw errors.validation([
        { path: 'durationMinutes', message: `الحد الأقصى لمدة الجلسة هو ${max} دقيقة` },
      ]);
    }
    targetActiveMinutes = input.durationMinutes;
  }

  let result;
  try {
    result = await withTransaction(async (dbSession) => {
      let visit = null;
      if (input.visitId) {
        visit = await Visit.findById(input.visitId).session(dbSession);
        if (!visit) throw errors.notFound('الزيارة');
        if (visit.status !== 'open') {
          throw errors.conflict(ERROR_CODES.VISIT_ALREADY_CLOSED, 'الزيارة مغلقة بالفعل');
        }
      } else {
        visit = await createVisitDoc({ dbSession, at: now });
      }

      const device = await Device.findOne({ _id: input.deviceId, isDeleted: false }).session(
        dbSession,
      );
      if (!device) throw errors.notFound('الجهاز');
      if (!device.isActive) {
        throw errors.conflict(ERROR_CODES.DEVICE_NOT_AVAILABLE, 'الجهاز غير مفعّل');
      }
      if (device.status !== DEVICE_STATUS.AVAILABLE) throw deviceConflict(device);

      const { ratePerHourMinor, option } = resolveRate(device, input.pricingOptionKey);

      const period = monthPeriod(now);
      const seq = await nextSequence('session', { session: dbSession, period });

      const [session] = await Session.create(
        [
          {
            sessionNumber: formatDocumentNumber('SES', period, seq),
            visit: visit._id,
            device: device._id,
            deviceSnapshot: { name: device.name, code: device.code, type: device.type },
            pricingOptionKey: option?.key ?? null,
            pricingOptionName: option?.name ?? null,
            ratePerHourMinor,
            billingMode,
            targetActiveMinutes,
            startedAt: now,
            expectedEndAt: targetActiveMinutes
              ? new Date(now.getTime() + targetActiveMinutes * 60 * 1000)
              : null,
            status: SESSION_STATUS.ACTIVE,
            activeSegments: [{ start: now, end: null }],
            pausedSegments: [],
            notes: input.notes ?? '',
            createdBy: actorId,
          },
        ],
        { session: dbSession },
      );

      const claimed = await Device.findOneAndUpdate(
        {
          _id: device._id,
          status: DEVICE_STATUS.AVAILABLE,
          isActive: true,
          isDeleted: false,
        },
        { $set: { status: DEVICE_STATUS.OCCUPIED, currentSession: session._id } },
        { new: true, session: dbSession },
      );
      if (!claimed) throw deviceConflict(device);

      visit.sessions.push(session._id);
      await visit.save({ session: dbSession });

      return {
        session: session.toObject(),
        visitId: String(visit._id),
        deviceId: String(device._id),
      };
    });
  } catch (error) {
    // Unique partial index on device => another request already took it.
    if (error?.code === 11000) {
      throw errors.conflict(ERROR_CODES.DEVICE_OCCUPIED, 'الجهاز مشغول بجلسة أخرى');
    }
    throw error;
  }

  emitEvent(SOCKET_EVENTS.SESSION_STARTED, {
    sessionId: String(result.session._id),
    deviceId: result.deviceId,
    visitId: result.visitId,
  });
  emitEvent(SOCKET_EVENTS.DEVICE_STATUS, {
    deviceId: result.deviceId,
    status: DEVICE_STATUS.OCCUPIED,
  });
  emitEvent(SOCKET_EVENTS.VISIT_UPDATED, { visitId: result.visitId });

  return {
    session: presentSession(result.session),
    visitId: result.visitId,
  };
}

export async function pauseSession(sessionId, { reason = '' } = {}, actorId) {
  const settings = await getSettings();
  if (settings.session && settings.session.allowPause === false) {
    throw errors.conflict(ERROR_CODES.CONFLICT_STATE, 'الإيقاف المؤقت غير مسموح من الإعدادات');
  }

  const session = await withTransaction(async (dbSession) => {
    const doc = await Session.findById(sessionId).session(dbSession);
    if (!doc) throw errors.notFound('الجلسة');
    if (doc.status === SESSION_STATUS.ENDED) {
      throw errors.conflict(ERROR_CODES.SESSION_ALREADY_ENDED, 'الجلسة منتهية بالفعل');
    }
    if (doc.status === SESSION_STATUS.PAUSED) {
      throw errors.conflict(ERROR_CODES.SESSION_PAUSED, 'الجلسة موقوفة بالفعل');
    }

    await pauseSessionDoc(doc, { at: new Date(), dbSession, reason });
    return doc.toObject();
  });

  emitEvent(SOCKET_EVENTS.SESSION_PAUSED, { sessionId: String(session._id), visitId: String(session.visit) });
  emitEvent(SOCKET_EVENTS.VISIT_UPDATED, { visitId: String(session.visit) });

  return { session: presentSession(session) };
}

export async function resumeSession(sessionId) {
  const session = await withTransaction(async (dbSession) => {
    const doc = await Session.findById(sessionId).session(dbSession);
    if (!doc) throw errors.notFound('الجلسة');
    if (doc.status === SESSION_STATUS.ENDED) {
      throw errors.conflict(ERROR_CODES.SESSION_ALREADY_ENDED, 'الجلسة منتهية بالفعل');
    }
    if (doc.status === SESSION_STATUS.ACTIVE) {
      throw errors.conflict(ERROR_CODES.CONFLICT_STATE, 'الجلسة تعمل بالفعل');
    }

    await resumeSessionDoc(doc, { at: new Date(), dbSession });
    return doc.toObject();
  });

  emitEvent(SOCKET_EVENTS.SESSION_RESUMED, { sessionId: String(session._id), visitId: String(session.visit) });
  emitEvent(SOCKET_EVENTS.VISIT_UPDATED, { visitId: String(session.visit) });

  return { session: presentSession(session) };
}

export async function extendSession(sessionId, { minutes }) {
  const session = await withTransaction(async (dbSession) => {
    const doc = await Session.findById(sessionId).session(dbSession);
    if (!doc) throw errors.notFound('الجلسة');
    if (doc.status === SESSION_STATUS.ENDED) {
      throw errors.conflict(ERROR_CODES.SESSION_ALREADY_ENDED, 'الجلسة منتهية بالفعل');
    }
    if (doc.billingMode !== BILLING_MODE.FIXED) {
      throw errors.conflict(ERROR_CODES.CONFLICT_STATE, 'تمديد الوقت متاح للجلسات المحددة فقط');
    }

    doc.targetActiveMinutes = (doc.targetActiveMinutes ?? 0) + minutes;
    const base = doc.expectedEndAt ? new Date(doc.expectedEndAt) : new Date(doc.startedAt);
    doc.expectedEndAt = new Date(base.getTime() + minutes * 60 * 1000);
    await doc.save({ session: dbSession });
    return doc.toObject();
  });

  emitEvent(SOCKET_EVENTS.SESSION_UPDATED, { sessionId: String(session._id), visitId: String(session.visit) });

  return { session: presentSession(session) };
}

/** BR-37/BR-38: ends gaming, frees the device and leaves the visit open. */
export async function endSession(sessionId, { reason = '' } = {}) {
  const result = await withTransaction(async (dbSession) => {
    const doc = await Session.findById(sessionId).session(dbSession);
    if (!doc) throw errors.notFound('الجلسة');

    const outcome = await endSessionDoc(doc, { at: new Date(), dbSession, reason });
    return {
      session: doc.toObject(),
      alreadyEnded: outcome.alreadyEnded,
      deviceId: outcome.deviceId,
      visitId: outcome.visitId,
    };
  });

  if (!result.alreadyEnded) {
    emitEvent(SOCKET_EVENTS.SESSION_ENDED, {
      sessionId: String(result.session._id),
      deviceId: result.deviceId,
      visitId: result.visitId,
    });
    emitEvent(SOCKET_EVENTS.DEVICE_STATUS, {
      deviceId: result.deviceId,
      status: DEVICE_STATUS.AVAILABLE,
    });
    emitEvent(SOCKET_EVENTS.VISIT_UPDATED, { visitId: result.visitId });
  }

  return { session: presentSession(result.session), alreadyEnded: result.alreadyEnded };
}

export async function listActiveSessions(query = {}) {
  const { page = 1, limit = 100, sort } = query;
  const filter = { status: { $in: [SESSION_STATUS.ACTIVE, SESSION_STATUS.PAUSED] } };
  const sortObject = resolveSort(sort, ['startedAt', 'timeChargeMinor'], 'startedAt');

  const [sessions, total] = await Promise.all([
    Session.find(filter)
      .sort(sortObject)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Session.countDocuments(filter),
  ]);

  const visits = await Visit.find({
    _id: { $in: sessions.map((session) => session.visit) },
  })
    .select('visitNumber playerName status openedAt invoice')
    .lean();
  const byId = new Map(visits.map((visit) => [String(visit._id), visit]));

  const items = sessions.map((session) => {
    const visit = byId.get(String(session.visit));
    return {
      ...presentSession(session),
      visit: visit
        ? {
            id: String(visit._id),
            visitNumber: visit.visitNumber,
            playerName: visit.playerName ?? '',
            status: visit.status,
            openedAt: visit.openedAt,
          }
        : null,
    };
  });

  return { sessions: items, pagination: paginationMeta(total, page, limit) };
}

export async function getSessionDetail(sessionId) {
  const session = await Session.findById(sessionId).lean();
  if (!session) throw errors.notFound('الجلسة');

  const visit = await Visit.findById(session.visit).lean();
  return presentSessionDetail(session, visit);
}
