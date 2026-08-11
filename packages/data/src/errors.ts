/** Machine-readable domain error codes surfaced to the POS UI. */
export type ErrorCode =
  | 'order_already_paid'
  | 'order_already_cancelled'
  | 'order_not_found'
  | 'device_revoked'
  | 'device_not_authorized'
  | 'permission_denied'
  | 'duplicate_operation'
  | 'shift_already_open'
  | 'shift_already_closed'
  | 'shift_not_found'
  | 'invalid_state_transition'
  | 'invalid_payment_amount'
  | 'invalid_order_snapshot'
  | 'invalid_food_cost'
  | 'network_unavailable';
export class DomainError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

/** Translate a raw InstantDB rejection into a domain error the UI can display. */
const REJECTION_MAP: Array<[RegExp, ErrorCode]> = [
  [/unique.*idempotency/i, 'duplicate_operation'],
  [/permission.*denied/i, 'permission_denied'],
  [/not.*found/i, 'order_not_found'],
];

export function domainErrorFrom(cause: unknown, fallback: ErrorCode = 'permission_denied'): DomainError {
  if (cause instanceof DomainError) return cause;

  const message = cause instanceof Error ? cause.message : String(cause ?? 'Unknown error');

  for (const [pattern, code] of REJECTION_MAP) {
    if (pattern.test(message)) return new DomainError(message, code);
  }

  return new DomainError(message, fallback);
}

/** Guard: return a DomainError if the order cannot be edited. */
export function guardActiveOrder(status: string, orderId: string): DomainError | null {
  if (status === 'paid') return new DomainError(`Order ${orderId} is already paid`, 'order_already_paid');
  if (status === 'cancelled') return new DomainError(`Order ${orderId} is cancelled`, 'order_already_cancelled');
  return null;
}

/** Guard: return a DomainError if shift state prevents the operation. */
export function guardShiftState(shift: { status: string } | null | undefined, operation: 'open' | 'close'): DomainError | null {
  if (operation === 'open') {
    if (shift) return new DomainError('A shift is already open', 'shift_already_open');
    return null;
  }
  if (!shift) return new DomainError('No open shift', 'shift_not_found');
  if (shift.status !== 'open') return new DomainError('Shift is already closed', 'shift_already_closed');
  return null;
}
