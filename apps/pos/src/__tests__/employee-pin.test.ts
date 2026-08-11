import { deriveEmployeePinVerifier } from '@lumo/data'
import { verifyOfflineEmployeePin, type OfflineEmployee } from '../data/employeePin';

const now = Date.parse('2026-08-11T10:00:00.000Z');
let employee: OfflineEmployee;

beforeAll(async () => {
  employee = {
    employeeId: 'waiter-1',
    displayName: 'Айжан',
    role: 'cashier',
    status: 'active',
    pinSalt: '0123456789abcdef0123456789abcdef',
    pinVerifier: await deriveEmployeePinVerifier('123456', '0123456789abcdef0123456789abcdef'),
    credentialsVersion: 2,
    expiresAt: '2026-08-12T10:00:00.000Z',
  };
});

describe('offline employee PIN', () => {
  it('unlocks an active employee when the unexpired six-digit PIN matches', async () => {
    await expect(verifyOfflineEmployeePin(employee, '123456', now)).resolves.toBe(true);
  });

  it('keeps the terminal locked for wrong, inactive, or expired credentials', async () => {
    await expect(verifyOfflineEmployeePin(employee, '000000', now)).resolves.toBe(false);
    await expect(verifyOfflineEmployeePin({ ...employee, status: 'inactive' }, '123456', now)).resolves.toBe(false);
    await expect(verifyOfflineEmployeePin({ ...employee, expiresAt: '2026-08-11T09:59:59.000Z' }, '123456', now)).resolves.toBe(false);
  });
});
