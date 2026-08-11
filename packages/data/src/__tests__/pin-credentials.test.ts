import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveEmployeePinVerifier,
  employeePinLookupHash,
  verifyEmployeePin,
} from '../pinCredentials.js';

const now = Date.parse('2026-08-11T10:00:00.000Z');
const salt = '0123456789abcdef0123456789abcdef';

test('six-digit PIN verifier accepts only the matching unexpired PIN', async () => {
  const pinVerifier = await deriveEmployeePinVerifier('123456', salt);
  const credential = {
    pinSalt: salt,
    pinVerifier,
    credentialsVersion: 1,
    expiresAt: '2026-08-12T10:00:00.000Z',
  };
  assert.equal(await verifyEmployeePin(credential, '123456', now), true);
  assert.equal(await verifyEmployeePin(credential, '654321', now), false);
  assert.equal(await verifyEmployeePin({ ...credential, expiresAt: '2026-08-11T10:00:00.000Z' }, '123456', now), false);
});

test('PIN lookup identity is deterministic and venue-scoped', () => {
  assert.equal(employeePinLookupHash('venue-a', '123456'), employeePinLookupHash('venue-a', '123456'));
  assert.notEqual(employeePinLookupHash('venue-a', '123456'), employeePinLookupHash('venue-b', '123456'));
});

test('four-digit legacy PINs are rejected', async () => {
  await assert.rejects(() => deriveEmployeePinVerifier('1234', salt), /exactly 6 digits/);
});
