import { Counter } from '../modules/core/counter.model.js';
import { dayjs } from './time.js';

/**
 * Atomically increments a named sequence. Pass the transaction session so the
 * number is rolled back with the document that consumes it.
 */
export async function nextSequence(scope, { session, period } = {}) {
  const id = period ? `${scope}:${period}` : scope;
  const counter = await Counter.findOneAndUpdate(
    { _id: id },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session },
  ).lean();
  return counter.seq;
}

/** YYMM in the business timezone, used in human-readable document numbers. */
export function monthPeriod(date = new Date(), timezone = 'Africa/Cairo') {
  return dayjs(date).tz(timezone).format('YYMM');
}

export function padSequence(value, width = 4) {
  return String(value).padStart(width, '0');
}

export function formatDocumentNumber(prefix, period, seq, width = 4) {
  return `${prefix}-${period}-${padSequence(seq, width)}`;
}
