import { TZDate } from '@date-fns/tz';
import { addDays, startOfDay, endOfDay, subDays } from 'date-fns';

/**
 * Day boundaries for a venue in its local timezone.
 *
 * All returned timestamps are UTC ISO 8601 strings suitable for
 * InstantDB `$gte` / `$lt` filters on indexed date fields.
 *
 * The range is always half-open: `$gte: start, $lt: end`.
 */

export interface DayBounds {
  /** Inclusive start (UTC ISO string). */
  start: string;
  /** Exclusive end (UTC ISO string). */
  end: string;
}

export function venueDay(timeZone: string, day: string): DayBounds {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error('day must use YYYY-MM-DD');
  const local = new TZDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]), timeZone);
  if (
    local.getFullYear() !== Number(match[1])
    || local.getMonth() !== Number(match[2]) - 1
    || local.getDate() !== Number(match[3])
  ) {
    throw new Error('day must be a valid calendar date');
  }
  const start = startOfDay(local);
  const end = startOfDay(addDays(local, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Returns today's boundaries in the given IANA timezone.
 *
 * @example
 *   // Venue in Bishkek (UTC+6), browser in Moscow (UTC+3)
 *   venueToday('Asia/Bishkek')
 *   // => { start: '2026-07-30T18:00:00.000Z', end: '2026-07-31T18:00:00.000Z' }
 */
export function venueToday(timeZone: string, refDate?: Date): DayBounds {
  const now = refDate ?? new Date();
  const local = new TZDate(now, timeZone);
  const start = startOfDay(local);
  const end = endOfDay(local);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Returns yesterday's boundaries in the given IANA timezone.
 */
export function venueYesterday(timeZone: string, refDate?: Date): DayBounds {
  const now = refDate ?? new Date();
  const local = new TZDate(now, timeZone);
  const yesterday = subDays(local, 1);
  const start = startOfDay(yesterday);
  const end = endOfDay(yesterday);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Returns the same weekday last week boundaries in the given IANA timezone.
 * Used for trend comparison: Friday vs Friday.
 */
export function venueSameDayLastWeek(timeZone: string, refDate?: Date): DayBounds {
  const now = refDate ?? new Date();
  const local = new TZDate(now, timeZone);
  const lastWeek = subDays(local, 7);
  const start = startOfDay(lastWeek);
  const end = endOfDay(lastWeek);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Returns last week's same weekday from local midnight through the same
 * local wall-clock time. Used for fair in-progress day comparisons.
 */
export function venueSameElapsedLastWeek(timeZone: string, refDate?: Date): DayBounds {
  const now = refDate ?? new Date();
  const local = new TZDate(now, timeZone);
  const lastWeek = subDays(local, 7);
  const start = startOfDay(lastWeek);
  return { start: start.toISOString(), end: lastWeek.toISOString() };
}

/**
 * Returns the bounds for `startOfDay` of `daysAgo` ago through today's end.
 * Useful for "last N days" queries.
 *
 * @example venueLastNDays('Asia/Bishkek', 7) → 7 days including today
 */
export function venueLastNDays(timeZone: string, n: number, refDate?: Date): DayBounds {
  const now = refDate ?? new Date();
  const local = new TZDate(now, timeZone);
  const end = endOfDay(local);
  const start = startOfDay(subDays(local, n - 1));
  return { start: start.toISOString(), end: end.toISOString() };
}
