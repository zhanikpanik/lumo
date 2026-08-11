import { getInstantClient } from '@/data/instant';
import { adminEmployeesQuery } from '@lumo/data';
import { useVenueId } from './useVenueId';

export interface InstantEmployee {
  id: string;
  name: string;
  role: string;
  status: string;
}

export function useInstantEmployees() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminEmployeesQuery(venueId));

  const data: InstantEmployee[] = (result.data?.employees ?? []).map(e => ({
    id: e.id,
    name: e.displayName,
    role: e.role,
    status: e.status,
  }));

  return { data, isLoading: result.isLoading, error: result.error };
}
