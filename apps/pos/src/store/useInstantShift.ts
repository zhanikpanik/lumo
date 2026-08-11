import { useMemo } from 'react';
import { getInstantClient, getVenueId } from '../data/instant';
interface InstantShift {
  id: string;
  openedAt: Date;
  startingCashTiyin: number;
  status: 'open' | 'closed';
  closedAt?: Date;
  countedCashTiyin?: number;
}

interface InstantShiftPayment {
  id: string;
  method: string;
  amountTiyin: number;
  changeTiyin: number;
}

interface InstantCashMovement {
  id: string;
  movementType: string;
  amountTiyin: number;
}

// ── Raw InstantDB row types ──
interface InstantPaymentRow { id: string; method: string; amountTiyin: number; changeTiyin: number }
interface InstantCashMovementRow { id: string; movementType: string; amountTiyin: number; occurredAt: string }

// ── Query result row type ──
interface ShiftQueryRow { id: string; openedAt: string; startingCashTiyin: number; status: string; closedAt?: string; countedCashTiyin?: number; payments?: InstantPaymentRow[]; cashMovements?: InstantCashMovementRow[] }

export interface InstantShiftData {
  openShift: InstantShift | null;
  payments: InstantShiftPayment[];
  cashMovements: InstantCashMovement[];
  isLoading: boolean;
  error: unknown;

  // Computed totals
  totalOrders: number;
  totalRevenueTiyin: number;
  cashTotalTiyin: number;
  cardTotalTiyin: number;
  otherTotalTiyin: number;
  cashCollectionsTiyin: number;
  cashFloatInTiyin: number;
  cashFloatOutTiyin: number;
  expectedCashTiyin: number;
}

/**
 * Live shift data from InstantDB. Replaces the imperative Supabase queries
 * in shiftStore with reactive queries — totals are computed from the ledger,
 * not maintained as mutable denormalized counters.
 */
export function useInstantShift(employeeId?: string): InstantShiftData {
  const db = getInstantClient();
  const venueId = getVenueId();

  const { data, isLoading, error } = db.useQuery(
    employeeId
      ? {
          shifts: {
            $: {
              where: {
                venue: venueId,
                status: 'open',
              },
            },
            payments: {},
            cashMovements: {},
          },
        }
      : null,
  );

  const openShift = (data?.shifts?.[0] as ShiftQueryRow | undefined) ?? null;

  const payments: InstantShiftPayment[] = useMemo(() => {
    if (!openShift?.payments) return [];
    return openShift.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amountTiyin: p.amountTiyin,
      changeTiyin: p.changeTiyin,
    }));
  }, [openShift?.payments]);

  const cashMovements: InstantCashMovement[] = useMemo(() => {
    if (!openShift?.cashMovements) return [];
    return openShift.cashMovements.map((m: InstantCashMovementRow) => ({
      id: m.id,
      movementType: m.movementType,
      amountTiyin: m.amountTiyin,
      occurredAt: m.occurredAt,
    }));
  }, [openShift?.cashMovements]);

  // Compute totals from ledger — single source of truth
  const totals = useMemo(() => {
    let totalOrders = 0;
    let totalRevenueTiyin = 0;
    let cashTotalTiyin = 0;
    let cardTotalTiyin = 0;
    let otherTotalTiyin = 0;

    for (const p of payments) {
      totalOrders += 1;
      totalRevenueTiyin += p.amountTiyin;
      if (p.method === 'cash') cashTotalTiyin += p.amountTiyin;
      else if (p.method === 'card') cardTotalTiyin += p.amountTiyin;
      else otherTotalTiyin += p.amountTiyin;
    }

    let cashCollectionsTiyin = 0;
    let cashFloatInTiyin = 0;
    let cashFloatOutTiyin = 0;

    for (const m of cashMovements) {
      if (m.movementType === 'collection') cashCollectionsTiyin += m.amountTiyin;
      else if (m.movementType === 'float_in') cashFloatInTiyin += m.amountTiyin;
      else if (m.movementType === 'float_out') cashFloatOutTiyin += m.amountTiyin;
    }

    const startingCash = openShift?.startingCashTiyin ?? 0;
    const expectedCashTiyin = startingCash + cashTotalTiyin - cashCollectionsTiyin + cashFloatInTiyin - cashFloatOutTiyin;

    return {
      totalOrders,
      totalRevenueTiyin,
      cashTotalTiyin,
      cardTotalTiyin,
      otherTotalTiyin,
      cashCollectionsTiyin,
      cashFloatInTiyin,
      cashFloatOutTiyin,
      expectedCashTiyin,
    };
  }, [payments, cashMovements, openShift?.startingCashTiyin]);

  return {
    openShift: openShift
      ? {
          id: openShift.id,
          openedAt: new Date(openShift.openedAt),
          startingCashTiyin: openShift.startingCashTiyin,
          status: openShift.status as InstantShift['status'],
          closedAt: openShift.closedAt ? new Date(openShift.closedAt) : undefined,
          countedCashTiyin: openShift.countedCashTiyin,
        }
      : null,
    payments,
    cashMovements,
    isLoading,
    error,
    ...totals,
  };
}
