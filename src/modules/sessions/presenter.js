import { computeSessionTime } from './billing.js';

/**
 * Public session shape shared by the device grid, visit screen and dashboard.
 * Live numbers are computed by the same billing function used at end (BR-S2).
 */
export function presentSession(session, at = new Date()) {
  if (!session) return null;
  const time = computeSessionTime(session, at);
  const device = session.deviceSnapshot ?? {};

  return {
    id: String(session._id),
    sessionNumber: session.sessionNumber,
    visitId: session.visit ? String(session.visit._id ?? session.visit) : null,
    deviceId: session.device ? String(session.device._id ?? session.device) : null,
    deviceName: device.name ?? '',
    deviceCode: device.code ?? '',
    deviceType: device.type ?? '',
    pricingOptionKey: session.pricingOptionKey ?? null,
    pricingOptionName: session.pricingOptionName ?? null,
    ratePerHourMinor: session.ratePerHourMinor,
    billingMode: session.billingMode,
    status: session.status,
    startedAt: session.startedAt,
    expectedEndAt: session.expectedEndAt ?? null,
    endedAt: session.endedAt ?? null,
    endReason: session.endReason ?? '',
    notes: session.notes ?? '',
    ...time,
  };
}

/** Compact shape embedded in device rows. */
export function presentSessionSummary(session, at = new Date()) {
  const view = presentSession(session, at);
  if (!view) return null;
  return {
    id: view.id,
    sessionNumber: view.sessionNumber,
    visitId: view.visitId,
    status: view.status,
    billingMode: view.billingMode,
    startedAt: view.startedAt,
    activeSeconds: view.activeSeconds,
    billableMinutes: view.billableMinutes,
    timeChargeMinor: view.timeChargeMinor,
    remainingSeconds: view.remainingSeconds,
    isOverdue: view.isOverdue,
  };
}
