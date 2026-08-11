import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeRateLimit, resetRateLimitsForTests } from './rate-limit.mjs';

test.beforeEach(() => resetRateLimitsForTests());

test('rejects attempts after the configured burst and reports retry time', () => {
  const config = { capacity: 2, periodMs: 1_000 };
  consumeRateLimit('email', 'owner@example.com', config, 0);
  consumeRateLimit('email', 'owner@example.com', config, 0);

  assert.throws(
    () => consumeRateLimit('email', 'owner@example.com', config, 0),
    (error) => error.statusCode === 429 && error.retryAfterSeconds === 1,
  );
});

test('isolates buckets and refills tokens over time', () => {
  const config = { capacity: 1, periodMs: 1_000 };
  consumeRateLimit('installation', 'tablet-a', config, 0);
  consumeRateLimit('installation', 'tablet-b', config, 0);
  consumeRateLimit('installation', 'tablet-a', config, 1_000);
});
