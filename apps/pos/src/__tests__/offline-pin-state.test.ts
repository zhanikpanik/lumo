import { deriveEmployeePinVerifier } from '@lumo/data'
import {
  cacheOfflineEmployees,
  clearOfflinePinState,
  loadOfflineEmployees,
  registerUnlockAttempt,
  pendingUnlockAttempts,
} from '../data/offlinePinState.web';
import type { OfflineEmployee } from '../data/employeePin';

const now = Date.parse('2026-08-11T10:00:00.000Z');
let employee: OfflineEmployee;

beforeAll(async () => {
  employee = {
    employeeId: 'waiter-1', displayName: 'Айжан', role: 'waiter', status: 'active',
    pinSalt: '0123456789abcdef0123456789abcdef',
    pinVerifier: await deriveEmployeePinVerifier('1234', '0123456789abcdef0123456789abcdef'),
    credentialsVersion: 1,
    expiresAt: '2026-09-11T10:00:00.000Z',
  };
});

test('offline verifier disappears after one day', async () => {
  const venueId = 'cache-expiry-venue';
  await cacheOfflineEmployees(venueId, [employee], now);
  await expect(loadOfflineEmployees(venueId, now + 24 * 60 * 60 * 1000)).resolves.toHaveLength(1);
  await expect(loadOfflineEmployees(venueId, now + 24 * 60 * 60 * 1000 + 1)).resolves.toEqual([]);
});

test('revoking device auth clears cached offline verifiers', async () => {
  const venueId = 'revoked-device-venue';
  await cacheOfflineEmployees(venueId, [employee], now);
  await clearOfflinePinState();
  await expect(loadOfflineEmployees(venueId, now)).resolves.toEqual([]);
});

test('wrong PIN attempts remain auditable without blocking the terminal', async () => {
  const venueId = 'repeated-failure-venue';
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await registerUnlockAttempt(venueId, 'failure', undefined, now + attempt);
  }
  const attempts = await pendingUnlockAttempts(venueId);
  expect(attempts).toHaveLength(6);
  expect(attempts.every(({ outcome }) => outcome === 'failure')).toBe(true);
});
