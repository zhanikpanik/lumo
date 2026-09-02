import assert from 'node:assert/strict';
import test from 'node:test';
import {
  venueDay,
  venueToday,
  venueYesterday,
  venueSameDayLastWeek,
  venueSameElapsedLastWeek,
  venueLastNDays,
} from '../venueDayBounds.js';

// Bishkek = UTC+6. Fixed reference dates for determinism.
// 2026-08-05T15:00:00Z = 2026-08-05T21:00:00+06:00 (same day in Bishkek)
const AUG_5_15UTC = new Date('2026-08-05T15:00:00Z');

// 2026-08-05T19:00:00Z = 2026-08-06T01:00:00+06:00 (next day in Bishkek)
const AUG_5_19UTC = new Date('2026-08-05T19:00:00Z');

test('specific venue day uses a half-open local-time range', () => {
  assert.deepEqual(venueDay('Asia/Bishkek', '2026-08-05'), {
    start: '2026-08-05T00:00:00.000+06:00',
    end: '2026-08-06T00:00:00.000+06:00',
  });
});

test('specific venue day rejects impossible calendar dates', () => {
  assert.throws(() => venueDay('UTC', '2026-02-30'), /valid calendar date/);
});

// ── venueToday ────────────────────────────────────────────

test('today in Asia/Bishkek at 21:00 local', () => {
  const bounds = venueToday('Asia/Bishkek', AUG_5_15UTC);
  // TZDate.toISOString() returns local+offset
  assert.equal(bounds.start, '2026-08-05T00:00:00.000+06:00');
  assert.equal(bounds.end, '2026-08-05T23:59:59.999+06:00');
});

test('today in Asia/Bishkek at 01:00 local = rolls to next day', () => {
  const bounds = venueToday('Asia/Bishkek', AUG_5_19UTC);
  assert.equal(bounds.start, '2026-08-06T00:00:00.000+06:00');
  assert.equal(bounds.end, '2026-08-06T23:59:59.999+06:00');
});

test('today in UTC timezone', () => {
  const bounds = venueToday('UTC', AUG_5_15UTC);
  assert.equal(bounds.start, '2026-08-05T00:00:00.000+00:00');
  assert.equal(bounds.end, '2026-08-05T23:59:59.999+00:00');
});

test('start is always before end', () => {
  const bounds = venueToday('Asia/Bishkek', AUG_5_15UTC);
  assert.ok(new Date(bounds.start).getTime() < new Date(bounds.end).getTime());
});

// ── venueYesterday ────────────────────────────────────────

test('yesterday in Asia/Bishkek', () => {
  const bounds = venueYesterday('Asia/Bishkek', AUG_5_15UTC);
  assert.equal(bounds.start, '2026-08-04T00:00:00.000+06:00');
  assert.equal(bounds.end, '2026-08-04T23:59:59.999+06:00');
});

// ── venueSameDayLastWeek ──────────────────────────────────

test('same day last week = exactly 7 days before today', () => {
  const today = venueToday('Asia/Bishkek', AUG_5_15UTC);
  const lastWeek = venueSameDayLastWeek('Asia/Bishkek', AUG_5_15UTC);

  const diff = new Date(today.start).getTime() - new Date(lastWeek.start).getTime();
  assert.equal(diff, 7 * 24 * 60 * 60 * 1000);
});

test('same elapsed window last week stops at the same local time', () => {
  const bounds = venueSameElapsedLastWeek('Asia/Bishkek', AUG_5_15UTC);

  assert.deepEqual(bounds, {
    start: '2026-07-29T00:00:00.000+06:00',
    end: '2026-07-29T21:00:00.000+06:00',
  });
});

// ── venueLastNDays ────────────────────────────────────────

test('last 1 day equals today', () => {
  const today = venueToday('Asia/Bishkek', AUG_5_15UTC);
  const last1 = venueLastNDays('Asia/Bishkek', 1, AUG_5_15UTC);
  assert.deepEqual(today, last1);
});

test('end is always today end regardless of N', () => {
  const today = venueToday('Asia/Bishkek', AUG_5_15UTC);
  const last30 = venueLastNDays('Asia/Bishkek', 30, AUG_5_15UTC);
  assert.equal(last30.end, today.end);
});

test('last 7 days start is 6 days before today start', () => {
  const today = venueToday('Asia/Bishkek', AUG_5_15UTC);
  const last7 = venueLastNDays('Asia/Bishkek', 7, AUG_5_15UTC);

  const diff = new Date(today.start).getTime() - new Date(last7.start).getTime();
  assert.equal(diff, 6 * 24 * 60 * 60 * 1000);
});
