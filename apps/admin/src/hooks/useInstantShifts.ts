import { getInstantClient } from '@/data/instant';
import { adminAllShiftsQuery } from '@lumo/data';
import { useVenueId } from './useVenueId';

export interface InstantShift {
  id: string;
  openedAt: string;
  closedAt: string | null;
  status: string;
  openedBy: string;
}

export function useInstantShifts() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminAllShiftsQuery(venueId));

  const data: InstantShift[] = (result.data?.shifts ?? []).map(s => ({
    id: s.id,
    openedAt: new Date(s.openedAt).toISOString(),
    closedAt: s.closedAt ? new Date(s.closedAt).toISOString() : null,
    status: s.status,
    openedBy: s.openedBy?.displayName || '—',
  }));

  return { data, isLoading: result.isLoading, error: result.error };
}
