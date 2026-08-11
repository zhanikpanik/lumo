import { deriveEmployeePinVerifier } from '@lumo/data'
import {
  cacheOfflineEmployees,
  clearOfflinePinState,
  loadOfflineEmployees,
  registerUnlockAttempt,
  unlockLockedUntil,
} from '../data/offlinePinState.web';
import type { OfflineEmployee } from '../data/employeePin';

const now = Date.parse('2026-08-11T10:00:00.000Z');
let employee: OfflineEmployee;

beforeAll(async () => {
  employee = {
    employeeId: 'waiter-1', displayName: 'Айжан', role: 'waiter', status: 'active',
    pinSalt: '0123456789abcdef0123456789abcdef',
    pinVerifier: await deriveEmployeePinVerifier('123456', '0123456789abcdef0123456789abcdef'),
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

test('five wrong PIN attempts lock the terminal for fifteen minutes', async () => {
  const venueId = 'lockout-venue';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await expect(registerUnlockAttempt(venueId, 'failure', undefined, now + attempt)).resolves.toBeNull();
  }
  const lockedUntil = await registerUnlockAttempt(venueId, 'failure', undefined, now + 4);
  expect(Date.parse(lockedUntil!)).toBe(now + 4 + 15 * 60 * 1000);
  await expect(unlockLockedUntil(venueId, now + 15 * 60 * 1000)).resolves.toBe(lockedUntil);
  await expect(unlockLockedUntil(venueId, now + 15 * 60 * 1000 + 5)).resolves.toBeNull();
});
