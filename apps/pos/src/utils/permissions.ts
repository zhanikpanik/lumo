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

/** Admin/owner can see sensitive data (expected cash balance, full audit). */
export function isAdmin(role: UserRole): boolean {
  return role === 'owner' || role === 'manager';
}
