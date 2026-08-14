/**
 * Role-based permission checks.
 * Waiter = restricted. Cashier+ = privileged. Owner/Manager = admin.
 */
import {
  can,
  isAdmin,
  resolveShiftEntry,
  requiresOrderTakeover,
  type PermissionAction,
  type UserRole,
} from '../utils/permissions';

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

describe('resolveShiftEntry', () => {
  it('keeps a waiter on PIN entry when no shift is open', () => {
    expect(resolveShiftEntry('waiter', false, false)).toBe('lock');
  });

  it('sends a cashier to open the missing shift', () => {
    expect(resolveShiftEntry('cashier', false, false)).toBe('open-shift');
  });

  it('sends every employee to orders when a shift is already open', () => {
    expect(resolveShiftEntry('waiter', true, false)).toBe('orders');
  });

  it('does not route until shift state is known', () => {
    expect(resolveShiftEntry('cashier', false, true)).toBe('loading');
  });
});

describe('requiresOrderTakeover', () => {
  const currentWaiter = { id: 'employee-1', name: 'Айжан', role: 'waiter' };

  it('lets a waiter enter an order they own', () => {
    expect(requiresOrderTakeover(
      currentWaiter,
      { ownerEmployeeId: 'employee-1', waiter: 'Айжан' },
      false,
    )).toBe(false);
  });

  it('asks for takeover PIN on another waiter’s order', () => {
    expect(requiresOrderTakeover(
      currentWaiter,
      { ownerEmployeeId: 'employee-2', waiter: 'Эрмек' },
      false,
    )).toBe(true);
  });

  it('does not lock orders for a cashier', () => {
    expect(requiresOrderTakeover(
      { id: 'employee-3', name: 'Кассир', role: 'cashier' },
      { ownerEmployeeId: 'employee-2', waiter: 'Эрмек' },
      false,
    )).toBe(false);
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
