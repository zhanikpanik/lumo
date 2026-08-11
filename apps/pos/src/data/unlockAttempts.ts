import { ACTIVATION_WORKER_URL } from '../config';
import { loadStoredDeviceAuth } from './instant';
import {
  acknowledgeUnlockAttempts,
  pendingUnlockAttempts,
  type UnlockAttemptEvent,
} from './offlinePinState';

export async function flushPendingUnlockAttempts(venueId: string): Promise<number> {
  if (!ACTIVATION_WORKER_URL) return 0;
  const auth = await loadStoredDeviceAuth();
  if (!auth || auth.venueId !== venueId) return 0;
  const queued = await pendingUnlockAttempts(venueId);
  const oldestAccepted = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const expired = queued.filter((attempt) => Date.parse(attempt.occurredAt) < oldestAccepted);
  const attempts = queued.filter((attempt) => Date.parse(attempt.occurredAt) >= oldestAccepted).slice(0, 100);
  if (expired.length > 0) await acknowledgeUnlockAttempts(venueId, expired.map((attempt) => attempt.id));
  if (attempts.length === 0) return 0;

  let response: Response;
  try {
    response = await fetch(`${ACTIVATION_WORKER_URL}/v1/pos/unlock-attempts`, {
      method: 'POST',
      headers: { authorization: `Bearer ${auth.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ attempts } satisfies { attempts: UnlockAttemptEvent[] }),
    });
  } catch {
    return 0;
  }
  if (!response.ok) return 0;
  const body = await response.json().catch(() => null) as { acceptedIds?: unknown } | null;
  const acceptedIds = Array.isArray(body?.acceptedIds)
    ? body.acceptedIds.filter((id): id is string => typeof id === 'string')
    : [];
  await acknowledgeUnlockAttempts(venueId, acceptedIds);
  return acceptedIds.length;
}
