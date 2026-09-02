export type UserRole = 'owner' | 'manager' | 'cashier' | 'waiter' | string | null | undefined;

export type PermissionAction =
  | 'openShift'
  | 'closeShift'
  | 'closeWithoutPayment'
  | 'refund'
  | 'cashTransaction';

/** Waiter can't do any privileged actions. Cashier+ can. */
export function can(role: UserRole, action: PermissionAction): boolean {
  if (role == null) return false;
  if (role === 'waiter') return false;
  return true;
}
export type ShiftEntryDecision = 'loading' | 'orders' | 'open-shift' | 'lock';
export type DeviceEntryStatus = 'authenticated' | 'activation-required';
export type ColdStartEntry = 'Activation' | 'Lock';

/** A process start always requires a fresh employee PIN, even when identity was persisted. */
export function resolveColdStartEntry(status: DeviceEntryStatus): ColdStartEntry {
  return status === 'activation-required' ? 'Activation' : 'Lock';
}

export function resolveShiftEntry(
  role: UserRole,
  hasOpenShift: boolean,
  isLoading: boolean,
): ShiftEntryDecision {
  if (isLoading) return 'loading';
  if (hasOpenShift) return 'orders';
  return can(role, 'openShift') ? 'open-shift' : 'lock';
}

export function requiresOrderTakeover(
  user: { id: string; name: string; role: UserRole } | null,
  order: { ownerEmployeeId?: string; waiter: string } | null,
  isTakeaway: boolean,
): boolean {
  if (!user || !order || user.role !== 'waiter' || isTakeaway) return false;
  return order.ownerEmployeeId
    ? order.ownerEmployeeId !== user.id
    : order.waiter !== user.name;
}

/** Admin/owner can see sensitive data (expected cash balance, full audit). */
export function isAdmin(role: UserRole): boolean {
  return role === 'owner' || role === 'manager';
}
