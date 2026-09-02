import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveEmployeePinVerifier,
  employeePinLookupHash,
  verifyEmployeePin,
} from '../pinCredentials.js';

const now = Date.parse('2026-08-11T10:00:00.000Z');
const salt = '0123456789abcdef0123456789abcdef';

test('four-digit PIN verifier accepts only the matching unexpired PIN', async () => {
  const pinVerifier = await deriveEmployeePinVerifier('1234', salt);
  const credential = {
    pinSalt: salt,
    pinVerifier,
    credentialsVersion: 1,
    expiresAt: '2026-08-12T10:00:00.000Z',
  };
  assert.equal(await verifyEmployeePin(credential, '1234', now), true);
  assert.equal(await verifyEmployeePin(credential, '6543', now), false);
  assert.equal(await verifyEmployeePin({ ...credential, expiresAt: '2026-08-11T10:00:00.000Z' }, '1234', now), false);
});

test('PIN lookup identity is deterministic and venue-scoped', () => {
  assert.equal(employeePinLookupHash('venue-a', '1234'), employeePinLookupHash('venue-a', '1234'));
  assert.notEqual(employeePinLookupHash('venue-a', '1234'), employeePinLookupHash('venue-b', '1234'));
});

test('six-digit legacy PINs are rejected', async () => {
  await assert.rejects(() => deriveEmployeePinVerifier('123456', salt), /exactly 4 digits/);
});
