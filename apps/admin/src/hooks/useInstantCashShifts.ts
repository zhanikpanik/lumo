import { useMemo } from 'react';
import type { InstaQLParams } from '@instantdb/react';
import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';
import { adminAllShiftsQuery, cashBalanceTiyin, type AppSchema } from '@lumo/data';

// ─── Types ────────────────────────────────────────────────────────

export interface CashShift {
  id: string;
  openTime: string;
  closeTime: string | null;
  openIso: string;
  closeIso: string | null;
  startBalance: number;
  collection: number | null;
  expectedCash: number;
  difference: number | null;
  closingCashCount: number | null;
  openingNote: string | null;
  closingNote: string | null;
  cashierName: string;
}

export type TransactionType =
  | 'sale'
  | 'refund'
  | 'cancel_refund'
  | 'float_in'
  | 'float_out'
  | 'income'
  | 'expense'
  | 'collection'
  | 'other';

export interface CashTransaction {
  id: string;
  shift_id: string | null;
  type: TransactionType;
  amount: number;
  note: string | null;
  transaction_at: string;
}

export interface NewTransaction {
  type: 'expense' | 'income' | 'collection';
  amount: number;
  note: string;
  transaction_at: string;
  shift_id: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────

function tyinToSom(tyin: number): number {
  return tyin / 100;
}

function formatShiftTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseMovementType(mt: string): TransactionType {
  if (
    mt === 'sale' || mt === 'refund' || mt === 'cancel_refund'
    || mt === 'float_in' || mt === 'float_out'
    || mt === 'income' || mt === 'expense' || mt === 'collection'
  ) return mt;
  return 'other';
}

// ─── Queries ──────────────────────────────────────────────────────

export const CASH_SHIFTS_PAGE_SIZE = 50;

export interface CashShiftsPageOptions {
  from?: Date;
  page?: number;
}

function shiftTransactionsQuery(venueId: string, shiftId: string) {
  return {
    shifts: {
      $: { where: { id: shiftId, 'venue.id': venueId }, limit: 1 },
      cashMovements: { $: { order: { occurredAt: 'desc' as const } } },
    },
  } satisfies InstaQLParams<AppSchema>;
}

// ─── Main hook: shifts with aggregated cash data ──────────────────

export function useInstantCashShifts({ from, page = 0 }: CashShiftsPageOptions = {}) {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminAllShiftsQuery(venueId, {
    from,
    limit: CASH_SHIFTS_PAGE_SIZE,
    offset: page * CASH_SHIFTS_PAGE_SIZE,
  }));
  const movementsByShift = new Map<string, NonNullable<typeof result.data>['cashMovements']>();
  for (const movement of result.data?.cashMovements ?? []) {
    const shift = Array.isArray(movement.shift) ? movement.shift[0] : movement.shift;
    if (!shift) continue;
    const movements = movementsByShift.get(shift.id) ?? [];
    movements.push(movement);
    movementsByShift.set(shift.id, movements);
  }

  const data = useMemo(() => {
    const shifts = result.data?.shifts ?? [];

    return shifts.map(s => {
      const movements = movementsByShift.get(s.id) ?? [];

      let collection = 0;
      for (const movement of movements) {
        if (movement.movementType === 'collection') {
          collection += tyinToSom(movement.amountTiyin ?? 0);
        }
      }

      const startBalance = tyinToSom(s.startingCashTiyin ?? 0);
      const expectedCash = tyinToSom(cashBalanceTiyin(s.startingCashTiyin ?? 0, movements));
      const countedCash = s.countedCashTiyin != null ? tyinToSom(s.countedCashTiyin) : null;
      const isClosed = s.status === 'closed';
      const difference = isClosed && countedCash != null ? countedCash - expectedCash : null;

      return {
        id: s.id,
        openTime: formatShiftTime(new Date(s.openedAt).toISOString()),
        closeTime: s.closedAt ? formatShiftTime(new Date(s.closedAt).toISOString()) : null,
        openIso: new Date(s.openedAt).toISOString(),
        closeIso: s.closedAt ? new Date(s.closedAt).toISOString() : null,
        startBalance,
        collection: collection > 0 ? collection : null,
        expectedCash,
        difference,
        closingCashCount: countedCash,
        openingNote: s.openingNote ?? null,
        closingNote: s.closingNote ?? null,
        cashierName: s.openedBy?.displayName || '—',
      } satisfies CashShift;
    });
  }, [result.data]);

  return {
    data,
    isLoading: result.isLoading,
    error: result.error,
    hasNextPage: Boolean(result.pageInfo?.shifts?.hasNextPage),
  };
}

// ─── Shift transactions ───────────────────────────────────────────

export function useInstantShiftTransactions(shiftId: string | null) {
  const db = getInstantClient();
  const venueId = useVenueId();

  const result = db.useQuery(shiftTransactionsQuery(venueId, shiftId ?? '__no_shift__'));

  const data = useMemo(() => {
    if (!shiftId) return [];
    const shift = result.data?.shifts?.find(s => s.id === shiftId);
    if (!shift) return [];

    return (shift.cashMovements ?? []).map(m => ({
      id: m.id,
      shift_id: shiftId,
      type: parseMovementType(m.movementType),
      amount: tyinToSom(m.amountTiyin ?? 0),
      note: m.note ?? null,
      transaction_at: new Date(m.occurredAt).toISOString(),
    } satisfies CashTransaction));
  }, [result.data, shiftId]);

  return { data, isLoading: result.isLoading, error: result.error };
}
