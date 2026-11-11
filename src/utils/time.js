import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export const DEFAULT_TIMEZONE = 'Africa/Cairo';

export const now = () => new Date();

export const secondsBetween = (start, end) =>
  Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));

/** Returns [startUtc, endUtc) for a business day (YYYY-MM-DD) in the given timezone. */
export function businessDayRange(dateStr, timezoneName = DEFAULT_TIMEZONE) {
  const day = dayjs.tz(dateStr, timezoneName).startOf('day');
  return {
    start: day.toDate(),
    end: day.add(1, 'day').toDate(),
    date: day.format('YYYY-MM-DD'),
    timezone: timezoneName,
  };
}

export function businessDateOf(value, timezoneName = DEFAULT_TIMEZONE) {
  return dayjs(value).tz(timezoneName).format('YYYY-MM-DD');
}

export function businessMonthRange(monthStr, timezoneName = DEFAULT_TIMEZONE) {
  const start = dayjs.tz(`${monthStr}-01`, timezoneName).startOf('month');
  return {
    start: start.toDate(),
    end: start.add(1, 'month').toDate(),
    month: start.format('YYYY-MM'),
    timezone: timezoneName,
  };
}

export function formatDateTime(value, timezoneName = DEFAULT_TIMEZONE) {
  return dayjs(value).tz(timezoneName).format('YYYY-MM-DD HH:mm');
}

export { dayjs };
