import { getInstantClient } from '@/data/instant';
import { adminEmployeesQuery } from '@lumo/data';
import { useVenueId } from './useVenueId';

export interface StaffMember {
  id: string;
  name: string;
  role: 'owner' | 'manager' | 'cashier' | 'waiter';
  email: string | null;
  pin: string | null;
  is_active: boolean;
  last_session_at: string | null;
  created_at: string;
}

export function useInstantStaff() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminEmployeesQuery(venueId));

  const data: StaffMember[] = (result.data?.employees ?? []).map((employee) => {
    const pinSecret = Array.isArray(employee.pinSecret) ? employee.pinSecret[0] : employee.pinSecret;
    const isActive = employee.status === 'active';
    return {
      id: employee.id,
      name: employee.displayName,
      role: (employee.role as StaffMember['role']) || 'waiter',
      email: employee.email ?? null,
      pin: isActive ? pinSecret?.pin ?? null : null,
      is_active: isActive,
      last_session_at: null, // not tracked in InstantDB employees entity
      created_at: employee.createdAt ? new Date(employee.createdAt).toISOString() : '',
    };
  });

  return { data, isLoading: result.isLoading, error: result.error };
}
