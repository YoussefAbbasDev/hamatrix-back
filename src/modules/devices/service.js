import { SESSION_STATUS, VISIT_STATUS, DEVICE_STATUS } from '../../utils/enums.js';
import { ERROR_CODES } from '../../utils/errorCodes.js';
import { Device } from './model.js';
import { Session } from '../sessions/model.js';
import { Visit } from '../visits/model.js';
import { errors } from '../../utils/errors.js';
import { audit } from '../audit/service.js';
import { emitEvent, SOCKET_EVENTS } from '../../sockets/events.js';
import { nextSequence, padSequence } from '../../utils/ids.js';
import { resolveSort, paginationMeta } from '../../utils/validation.js';
import { presentSession, presentSessionSummary } from '../sessions/presenter.js';
import { businessDayRange, DEFAULT_TIMEZONE } from '../../utils/time.js';

const RUNNING = [SESSION_STATUS.ACTIVE, SESSION_STATUS.PAUSED];

export function presentDevice(device, currentSession = null) {
  const options = (device.pricingOptions ?? []).map((option) => ({
    key: option.key,
    name: option.name,
    pricePerHourMinor: option.pricePerHourMinor,
  }));

  return {
    id: String(device._id),
    name: device.name,
    code: device.code,
    type: device.type,
    description: device.description ?? '',
    hourlyPriceMinor: device.hourlyPriceMinor,
    pricingOptions: options,
    status: device.status,
    isActive: device.isActive,
    currentSession: currentSession ? presentSessionSummary(currentSession) : null,
    lastMaintenanceAt: device.lastMaintenanceAt ?? null,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  };
}

async function attachSessions(devices) {
  const ids = devices.map((device) => device.currentSession).filter(Boolean);
  if (ids.length === 0) return devices.map((device) => presentDevice(device));
  const sessions = await Session.find({ _id: { $in: ids } }).lean();
  const byId = new Map(sessions.map((session) => [String(session._id), session]));
  return devices.map((device) =>
    presentDevice(device, device.currentSession ? byId.get(String(device.currentSession)) : null),
  );
}

export async function listDevices(query) {
  const { page, limit, sort, status, type, isActive, q } = query;
  const filter = { isDeleted: false };
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (isActive !== undefined) filter.isActive = isActive;
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { code: regex }, { description: regex }];
  }

  const sortObject = resolveSort(sort, ['code', 'name', 'status', 'createdAt', 'updatedAt'], 'code');
  const [devices, total] = await Promise.all([
    Device.find(filter)
      .sort(sortObject)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Device.countDocuments(filter),
  ]);

  return {
    devices: await attachSessions(devices),
    pagination: paginationMeta(total, page, limit),
  };
}

export async function getDevice(id) {
  const device = await Device.findOne({ _id: id, isDeleted: false }).lean();
  if (!device) throw errors.notFound('الجهاز');

  const session = device.currentSession
    ? await Session.findById(device.currentSession).lean()
    : null;

  return {
    device: presentDevice(device, session),
    maintenanceLog: (device.maintenanceLog ?? []).slice(-10).reverse(),
  };
}

export async function createDevice(input) {
  const data = {
    name: input.name,
    type: input.type ?? 'PC',
    hourlyPriceMinor: input.hourlyPriceMinor,
    pricingOptions: input.pricingOptions ?? [],
    description: input.description ?? '',
    isActive: input.isActive ?? true,
  };

  if (input.code) {
    data.code = input.code.toUpperCase();
  } else {
    const seq = await nextSequence('device');
    data.code = `DEV-${padSequence(seq, 3)}`;
  }

  const device = await Device.create(data);
  return presentDevice(device.toObject());
}

export async function updateDevice(id, patch, actorId, req) {
  const device = await Device.findOne({ _id: id, isDeleted: false });
  if (!device) throw errors.notFound('الجهاز');

  const before = {
    name: device.name,
    code: device.code,
    type: device.type,
    hourlyPriceMinor: device.hourlyPriceMinor,
    pricingOptions: device.pricingOptions.map((option) => ({
      key: option.key,
      name: option.name,
      pricePerHourMinor: option.pricePerHourMinor,
    })),
  };

  const priceChanged =
    patch.hourlyPriceMinor !== undefined && patch.hourlyPriceMinor !== device.hourlyPriceMinor;

  if (patch.name !== undefined) device.name = patch.name;
  if (patch.code !== undefined) device.code = patch.code.toUpperCase();
  if (patch.type !== undefined) device.type = patch.type;
  if (patch.hourlyPriceMinor !== undefined) device.hourlyPriceMinor = patch.hourlyPriceMinor;
  if (patch.pricingOptions !== undefined) device.pricingOptions = patch.pricingOptions;
  if (patch.description !== undefined) device.description = patch.description;
  if (patch.isActive !== undefined) device.isActive = patch.isActive;

  await device.save();

  if (priceChanged) {
    // BR-03: running sessions keep their own snapshot; only future sessions change.
    await audit({
      action: 'DEVICE_PRICE_CHANGED',
      entityType: 'Device',
      entityId: device._id,
      actorId,
      before: { hourlyPriceMinor: before.hourlyPriceMinor, pricingOptions: before.pricingOptions },
      after: {
        hourlyPriceMinor: device.hourlyPriceMinor,
        pricingOptions: device.pricingOptions,
      },
      req,
    });
  }

  return presentDevice(device.toObject());
}

export async function deleteDevice(id) {
  const device = await Device.findOne({ _id: id, isDeleted: false });
  if (!device) throw errors.notFound('الجهاز');

  const running = await Session.exists({ device: device._id, status: { $in: RUNNING } });
  if (running) {
    throw errors.conflict(
      ERROR_CODES.CONFLICT_STATE,
      'لا يمكن حذف جهاز عليه جلسة جارية أو موقوفة',
    );
  }

  const sessionIds = await Session.distinct('_id', { device: device._id });
  if (sessionIds.length > 0) {
    const openVisit = await Visit.exists({
      status: VISIT_STATUS.OPEN,
      sessions: { $in: sessionIds },
    });
    if (openVisit) {
      throw errors.conflict(
        ERROR_CODES.CONFLICT_STATE,
        'الجهاز مرتبط بزيارة مفتوحة. أنهِ الزيارة أولًا.',
      );
    }
  }

  device.isDeleted = true;
  device.deletedAt = new Date();
  device.isActive = false;
  device.status = DEVICE_STATUS.AVAILABLE;
  device.currentSession = null;
  await device.save();

  return { id: String(device._id) };
}

export async function startMaintenance(id, { reason = '' }, actorId, req) {
  const device = await Device.findOne({ _id: id, isDeleted: false });
  if (!device) throw errors.notFound('الجهاز');

  const running = await Session.exists({ device: device._id, status: { $in: RUNNING } });
  if (running) {
    throw errors.conflict(ERROR_CODES.DEVICE_OCCUPIED, 'الجهاز مشغول بجلسة جارية');
  }
  if (device.status === DEVICE_STATUS.MAINTENANCE) {
    throw errors.conflict(ERROR_CODES.CONFLICT_STATE, 'الجهاز في الصيانة بالفعل');
  }

  const now = new Date();
  device.status = DEVICE_STATUS.MAINTENANCE;
  device.lastMaintenanceAt = now;
  device.maintenanceLog.push({ startedAt: now, endedAt: null, reason, by: actorId });
  await device.save();

  await audit({
    action: 'DEVICE_MAINTENANCE_STARTED',
    entityType: 'Device',
    entityId: device._id,
    actorId,
    after: { reason },
    req,
  });

  emitEvent(SOCKET_EVENTS.DEVICE_STATUS, { deviceId: String(device._id), status: device.status });
  return presentDevice(device.toObject());
}

export async function completeMaintenance(id, actorId, req) {
  const device = await Device.findOne({ _id: id, isDeleted: false });
  if (!device) throw errors.notFound('الجهاز');
  if (device.status !== DEVICE_STATUS.MAINTENANCE) {
    throw errors.conflict(ERROR_CODES.CONFLICT_STATE, 'الجهاز ليس في الصيانة');
  }

  const now = new Date();
  const openEntry = [...device.maintenanceLog].reverse().find((entry) => !entry.endedAt);
  if (openEntry) openEntry.endedAt = now;

  device.status = DEVICE_STATUS.AVAILABLE;
  await device.save();

  await audit({
    action: 'DEVICE_MAINTENANCE_COMPLETED',
    entityType: 'Device',
    entityId: device._id,
    actorId,
    req,
  });

  emitEvent(SOCKET_EVENTS.DEVICE_STATUS, { deviceId: String(device._id), status: device.status });
  return presentDevice(device.toObject());
}

export async function deviceStats(id, { from, to } = {}) {
  const device = await Device.findOne({ _id: id, isDeleted: false }).lean();
  if (!device) throw errors.notFound('الجهاز');

  const start = from
    ? businessDayRange(from, DEFAULT_TIMEZONE).start
    : businessDayRange(new Date().toISOString().slice(0, 10), DEFAULT_TIMEZONE).start;
  const end = to
    ? businessDayRange(to, DEFAULT_TIMEZONE).end
    : new Date();

  const sessions = await Session.find({
    device: device._id,
    status: SESSION_STATUS.ENDED,
    startedAt: { $gte: start, $lt: end },
  }).lean();

  const activeSeconds = sessions.reduce((sum, session) => sum + (session.activeSeconds ?? 0), 0);
  const revenueMinor = sessions.reduce((sum, session) => sum + (session.timeChargeMinor ?? 0), 0);
  const calendarSeconds = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 1000));

  return {
    deviceId: String(device._id),
    range: { from: start.toISOString(), to: end.toISOString() },
    sessions: sessions.length,
    activeSeconds,
    activeHours: Number((activeSeconds / 3600).toFixed(2)),
    revenueMinor,
    averageActiveSeconds: sessions.length
      ? Math.round(activeSeconds / sessions.length)
      : 0,
    utilizationPercent: Number(((activeSeconds / calendarSeconds) * 100).toFixed(1)),
  };
}

export async function deviceSessions(id, { page, limit, sort, from, to } = {}) {
  const device = await Device.findOne({ _id: id, isDeleted: false }).lean();
  if (!device) throw errors.notFound('الجهاز');

  const filter = { device: device._id };
  if (from || to) {
    filter.startedAt = {};
    if (from) filter.startedAt.$gte = businessDayRange(from, DEFAULT_TIMEZONE).start;
    if (to) filter.startedAt.$lt = businessDayRange(to, DEFAULT_TIMEZONE).end;
  }

  const sortObject = resolveSort(sort, ['startedAt', 'endedAt', 'timeChargeMinor'], '-startedAt');
  const [sessions, total] = await Promise.all([
    Session.find(filter)
      .sort(sortObject)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Session.countDocuments(filter),
  ]);

  return {
    sessions: sessions.map((session) => presentSession(session)),
    pagination: paginationMeta(total, page, limit),
  };
}
