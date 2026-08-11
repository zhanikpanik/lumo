import { getInstantClient } from '@/data/instant';
import { adminEmployeesQuery } from '@lumo/data';
import { useVenueId } from './useVenueId';

export interface StaffMember {
  id: string;
  name: string;
  role: 'owner' | 'manager' | 'cashier' | 'waiter';
  email: string | null;
  is_active: boolean;
  last_session_at: string | null;
  created_at: string;
}

export function useInstantStaff() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminEmployeesQuery(venueId));

  const data: StaffMember[] = (result.data?.employees ?? []).map(e => ({
    id: e.id,
    name: e.displayName,
    role: (e.role as StaffMember['role']) || 'waiter',
    email: e.email ?? null,
    is_active: e.status === 'active',
    last_session_at: null, // not tracked in InstantDB employees entity
    created_at: e.createdAt ? new Date(e.createdAt).toISOString() : '',
  }));

  return { data, isLoading: result.isLoading, error: result.error };
}
