const buckets = new Map();
let lastCleanupAt = 0;

function cleanup(now) {
  if (now - lastCleanupAt < 60_000 && buckets.size < 10_000) return;
  lastCleanupAt = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastSeenAt > bucket.periodMs * 2) buckets.delete(key);
  }
}

export function consumeRateLimit(scope, key, { capacity, periodMs }, now = Date.now()) {
  cleanup(now);
  const bucketKey = `${scope}:${key}`;
  const current = buckets.get(bucketKey);
  const elapsed = current ? Math.max(0, now - current.updatedAt) : 0;
  const available = current
    ? Math.min(capacity, current.tokens + (elapsed * capacity) / periodMs)
    : capacity;

  if (available < 1) {
    const retryAfterMs = Math.ceil(((1 - available) * periodMs) / capacity);
    const error = new Error('Too many activation attempts');
    error.statusCode = 429;
    error.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    throw error;
  }

  buckets.set(bucketKey, {
    tokens: available - 1,
    updatedAt: now,
    lastSeenAt: now,
    periodMs,
  });
}

export function resetRateLimitsForTests() {
  buckets.clear();
  lastCleanupAt = 0;
}
