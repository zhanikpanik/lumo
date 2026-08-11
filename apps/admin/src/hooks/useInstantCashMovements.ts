import { getInstantClient } from '@/data/instant';
import { adminCashMovementsQuery } from '@lumo/data';
import { useVenueId } from './useVenueId';

export interface InstantCashMovement {
  id: string;
  type: string;
  amountTiyin: number;
  note: string | null;
  occurredAt: string;
  shiftId: string | null;
}

export const CASH_MOVEMENTS_PAGE_SIZE = 100;

export interface CashMovementsPageOptions {
  from?: Date;
  page?: number;
}

export function useInstantCashMovements({ from, page = 0 }: CashMovementsPageOptions = {}) {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminCashMovementsQuery(venueId, {
    from,
    limit: CASH_MOVEMENTS_PAGE_SIZE,
    offset: page * CASH_MOVEMENTS_PAGE_SIZE,
  }));

  const data: InstantCashMovement[] = (result.data?.cashMovements ?? []).map(m => {
    const shift = Array.isArray(m.shift) ? m.shift[0] : m.shift;
    return {
      id: m.id,
      type: m.movementType,
      amountTiyin: m.amountTiyin,
      note: m.note ?? null,
      occurredAt: new Date(m.occurredAt).toISOString(),
      shiftId: shift?.id ?? null,
    };
  });

  return {
    data,
    isLoading: result.isLoading,
    error: result.error,
    hasNextPage: Boolean(result.pageInfo?.cashMovements?.hasNextPage),
  };
}
