import { describe, it, expect } from 'vitest';
import {
  billableMinutesOf,
  timeChargeOf,
  sumSegments,
  computeSessionTime,
} from '../src/modules/sessions/billing.js';

describe('billing: nearest minute, no minimum', () => {
  it('rounds half up to the nearest whole minute', () => {
    expect(billableMinutesOf(0)).toBe(0);
    expect(billableMinutesOf(29)).toBe(0);
    expect(billableMinutesOf(30)).toBe(1);
    expect(billableMinutesOf(89)).toBe(1);
    expect(billableMinutesOf(90)).toBe(2);
  });

  it('bills 1:23:17 as 83 minutes', () => {
    const seconds = 1 * 3600 + 23 * 60 + 17;
    expect(seconds).toBe(4997);
    expect(billableMinutesOf(seconds)).toBe(83);
    expect(timeChargeOf(3000, 83)).toBe(4150);
  });

  it('never applies a minimum charge', () => {
    expect(timeChargeOf(3000, 1)).toBe(50);
    expect(timeChargeOf(3000, 2)).toBe(100);
  });

  it('rounds the money half up', () => {
    // 3333 * 1 / 60 = 55.55 => 56 piastres
    expect(timeChargeOf(3333, 1)).toBe(56);
  });

  it('sums active segments only while open', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const segments = [
      { start: new Date('2026-01-01T10:00:00.000Z'), end: new Date('2026-01-01T10:30:00.000Z') },
      { start: new Date('2026-01-01T11:00:00.000Z'), end: null },
    ];
    expect(sumSegments(segments, now)).toBe(30 * 60 + 60 * 60);
  });

  it('freezes stored numbers for an ended session', () => {
    const view = computeSessionTime({
      status: 'ended',
      ratePerHourMinor: 3000,
      activeSeconds: 4997,
      pausedSeconds: 120,
      billableMinutes: 83,
      timeChargeMinor: 4150,
      targetActiveMinutes: null,
      activeSegments: [],
      pausedSegments: [],
    });

    expect(view.billableMinutes).toBe(83);
    expect(view.timeChargeMinor).toBe(4150);
    expect(view.overtimeSeconds).toBe(0);
  });

  it('reports overtime for a fixed session', () => {
    const view = computeSessionTime({
      status: 'active',
      ratePerHourMinor: 3000,
      targetActiveMinutes: 60,
      activeSegments: [{ start: new Date(Date.now() - 90 * 60 * 1000), end: null }],
    });

    expect(view.targetActiveMinutes).toBe(60);
    expect(view.isOverdue).toBe(true);
    expect(view.overtimeSeconds).toBeGreaterThan(0);
  });
});
