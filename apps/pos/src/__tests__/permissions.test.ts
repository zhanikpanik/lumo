/**
 * Role-based permission checks.
 * Waiter = restricted. Cashier+ = privileged. Owner/Manager = admin.
 */
import { can, isAdmin, type UserRole, type PermissionAction } from '../utils/permissions';

describe('can', () => {
  const privilegedActions: PermissionAction[] = [
    'openShift', 'closeShift', 'closeWithoutPayment', 'refund', 'cashTransaction',
  ];

  it.each(privilegedActions)('cashier can %s', (action) => {
    expect(can('cashier', action)).toBe(true);
  });

  it.each(privilegedActions)('manager can %s', (action) => {
    expect(can('manager', action)).toBe(true);
  });

  it.each(privilegedActions)('owner can %s', (action) => {
    expect(can('owner', action)).toBe(true);
  });

  it.each(privilegedActions)('waiter CANNOT %s', (action) => {
    expect(can('waiter', action)).toBe(false);
  });

  it('denies when role is null or undefined', () => {
    expect(can(null, 'openShift')).toBe(false);
    expect(can(undefined, 'openShift')).toBe(false);
  });
});

describe('isAdmin', () => {
  it('owner is admin', () => {
    expect(isAdmin('owner')).toBe(true);
  });

  it('manager is admin', () => {
    expect(isAdmin('manager')).toBe(true);
  });

  it('cashier is not admin', () => {
    expect(isAdmin('cashier')).toBe(false);
  });

  it('waiter is not admin', () => {
    expect(isAdmin('waiter')).toBe(false);
  });

  it('null/undefined is not admin', () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});
