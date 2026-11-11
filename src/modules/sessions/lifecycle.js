import { DEVICE_STATUS, SESSION_STATUS } from '../../utils/enums.js';
import { Device } from '../devices/model.js';
import { computeSessionTime } from './billing.js';

/** Closes any open active/paused segment at `at` (never counts pause time). */
export function closeOpenSegments(doc, at) {
  for (const segment of doc.activeSegments) {
    if (!segment.end) segment.end = at;
  }
  for (const segment of doc.pausedSegments) {
    if (!segment.end) segment.end = at;
  }
}

async function freeDevice(doc, dbSession) {
  await Device.updateOne(
    { _id: doc.device, currentSession: doc._id },
    { $set: { status: DEVICE_STATUS.AVAILABLE, currentSession: null } },
    { session: dbSession },
  );
}

/**
 * BR-37: freezes `activeSeconds`, `billableMinutes` and `timeChargeMinor`,
 * frees the device and leaves the visit open. Idempotent (BR-38).
 */
export async function endSessionDoc(doc, { at = new Date(), dbSession, reason = '' } = {}) {
  if (doc.status === SESSION_STATUS.ENDED) {
    return {
      alreadyEnded: true,
      time: computeSessionTime(doc),
      deviceId: String(doc.device),
      visitId: String(doc.visit),
    };
  }

  closeOpenSegments(doc, at);
  const time = computeSessionTime(doc, at);

  doc.activeSeconds = time.activeSeconds;
  doc.pausedSeconds = time.pausedSeconds;
  doc.billableMinutes = time.billableMinutes;
  doc.timeChargeMinor = time.timeChargeMinor;
  doc.overtimeSeconds = time.overtimeSeconds;
  doc.status = SESSION_STATUS.ENDED;
  doc.endedAt = at;
  if (reason) doc.endReason = reason;
  await doc.save({ session: dbSession });

  await freeDevice(doc, dbSession);

  return {
    alreadyEnded: false,
    time,
    deviceId: String(doc.device),
    visitId: String(doc.visit),
  };
}

/** BR-35: pause keeps the device occupied and stops the billable timer. */
export async function pauseSessionDoc(doc, { at = new Date(), dbSession, reason = '' } = {}) {
  const active = doc.activeSegments.at(-1);
  if (active && !active.end) active.end = at;
  doc.pausedSegments.push({ start: at, end: null, reason });
  doc.status = SESSION_STATUS.PAUSED;
  await doc.save({ session: dbSession });
}

/** BR-36: resume closes the pause and opens a fresh active segment. */
export async function resumeSessionDoc(doc, { at = new Date(), dbSession } = {}) {
  const paused = doc.pausedSegments.at(-1);
  if (paused && !paused.end) paused.end = at;

  const pausedMs = paused ? Math.max(0, at.getTime() - new Date(paused.start).getTime()) : 0;
  if (doc.expectedEndAt) {
    doc.expectedEndAt = new Date(new Date(doc.expectedEndAt).getTime() + pausedMs);
  }

  doc.activeSegments.push({ start: at, end: null });
  doc.status = SESSION_STATUS.ACTIVE;
  await doc.save({ session: dbSession });
}
