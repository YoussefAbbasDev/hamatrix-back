import money from '../../utils/money.js';
import { SESSION_STATUS } from '../../utils/enums.js';

/**
 * BR-09 / BR-06 / BR-D4: the single billing implementation used both for the
 * live estimate and for the frozen end-of-session charge.
 *
 *   activeSeconds   = Σ (end − start) over activeSegments      (pauses excluded)
 *   billableMinutes = floor((activeSeconds + 30) / 60)         (nearest minute, half-up)
 *   timeCharge      = roundHalfUp(ratePerHourMinor × minutes / 60)
 */
export const ROUNDING_SECONDS = 30;

export function segmentSeconds(segment, at = new Date()) {
  const start = new Date(segment.start).getTime();
  const end = segment.end ? new Date(segment.end).getTime() : new Date(at).getTime();
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function sumSegments(segments = [], at = new Date()) {
  return segments.reduce((total, segment) => total + segmentSeconds(segment, at), 0);
}

export function billableMinutesOf(activeSeconds) {
  if (!Number.isFinite(activeSeconds) || activeSeconds <= 0) return 0;
  return Math.floor((activeSeconds + ROUNDING_SECONDS) / 60);
}

export function timeChargeOf(ratePerHourMinor, billableMinutes) {
  return money.mulRate(ratePerHourMinor, billableMinutes, 60);
}

/**
 * Computes the live numbers for a running session, or returns the frozen
 * numbers for an ended one. Both paths use the same math (BR-S2).
 */
export function computeSessionTime(session, at = new Date()) {
  const ended = session.status === SESSION_STATUS.ENDED;

  const activeSeconds = ended
    ? session.activeSeconds ?? 0
    : sumSegments(session.activeSegments ?? [], at);
  const pausedSeconds = ended
    ? session.pausedSeconds ?? 0
    : sumSegments(session.pausedSegments ?? [], at);
  const billableMinutes = ended
    ? session.billableMinutes ?? 0
    : billableMinutesOf(activeSeconds);
  const timeChargeMinor = ended
    ? session.timeChargeMinor ?? 0
    : timeChargeOf(session.ratePerHourMinor, billableMinutes);

  const targetSeconds = session.targetActiveMinutes ? session.targetActiveMinutes * 60 : null;
  const remainingSeconds =
    targetSeconds === null ? null : Math.max(0, targetSeconds - activeSeconds);
  const overtimeSeconds = targetSeconds === null ? 0 : Math.max(0, activeSeconds - targetSeconds);
  const isOverdue = targetSeconds !== null && activeSeconds >= targetSeconds;

  return {
    activeSeconds,
    pausedSeconds,
    billableMinutes,
    timeChargeMinor,
    targetActiveMinutes: session.targetActiveMinutes ?? null,
    remainingSeconds,
    overtimeSeconds,
    isOverdue,
  };
}
