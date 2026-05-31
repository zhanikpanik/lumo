export type UserRole = 'owner' | 'manager' | 'cashier' | 'waiter' | string | null | undefined;

export type PermissionAction =
  | 'openShift'
  | 'closeShift'
  | 'closeWithoutPayment'
  | 'refund'
  | 'cashTransaction';

export function can(role: UserRole, action: PermissionAction): boolean {
  if (role == null) return false;
  if (role === 'waiter') return false;
  return true;
}
