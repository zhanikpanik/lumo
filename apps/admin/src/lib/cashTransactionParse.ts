/**
 * Normalize cash_movements rows (POS → admin schema alignment).
 *
 * Real table:         cash_movements
 * Admin UI expects:   type (expense/income/collection), payment_method, transaction_at
 *
 * Mapping:
 *   movement_type 'float_in'|'sale'     → type 'income'
 *   movement_type 'float_out'|'refund'  → type 'expense'
 *   movement_type 'collection'          → type 'collection'
 *   payment_method                      → default 'cash' (not tracked on cash_movements)
 *   occurred_at                         → transaction_at
 */

export type ParsedTxType = 'expense' | 'income' | 'collection' | 'other';

const TYPE_MAP: Record<string, ParsedTxType> = {
  income: 'income',
  expense: 'expense',
  collection: 'collection',
  float_in: 'income',
  float_out: 'expense',
  sale: 'income',
  refund: 'expense',
  in: 'income',
  out: 'expense',
  deposit: 'income',
  withdrawal: 'expense',
  encashment: 'collection',
};

export function parseCashTxType(raw: unknown): ParsedTxType {
  const k = String(raw ?? '')
    .trim()
    .toLowerCase();
  return TYPE_MAP[k] ?? 'other';
}

/** Reverse: admin type → cash_movements.movement_type */
const REVERSE_TYPE_MAP: Record<string, string> = {
  income: 'float_in',
  expense: 'float_out',
  collection: 'collection',
};

export function txTypeToMovementType(type: string): string {
  return REVERSE_TYPE_MAP[type] ?? type;
}

/** POS RPC defaults to cash; nullable column should still affect the drawer.
 *  cash_movements doesn't track payment_method — always returns 'cash'. */
export function parseCashTxPaymentMethod(raw: unknown): 'cash' | 'card' {
  const k = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (k === 'card') return 'card';
  return 'cash';
}

export function parseCashTxAmount(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function parseCashTxShiftId(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  return String(raw);
}
