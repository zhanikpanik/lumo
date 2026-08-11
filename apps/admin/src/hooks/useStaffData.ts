import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, VENUE_ID } from '@/lib/supabase';

export interface StaffMember {
  id: string;
  name: string;
  pin: string;
  role: 'owner' | 'manager' | 'cashier' | 'waiter';
  email: string | null;
  is_active: boolean;
  last_session_at: string | null;
  created_at: string;
}

async function fetchStaff(): Promise<StaffMember[]> {
  // Get user IDs for this venue
  const { data: uvData, error: uvError } = await supabase
    .from('user_venues')
    .select('user_id')
    .eq('venue_id', VENUE_ID);

  if (uvError) throw uvError;
  if (!uvData || uvData.length === 0) return [];

  const userIds = uvData.map((uv: any) => uv.user_id);

  const { data, error } = await supabase
    .from('users')
    .select('id, name, pin, role, email, is_active, last_session_at, created_at')
    .in('id', userIds)
    .order('created_at');

  if (error) throw error;
  return (data || []) as StaffMember[];
}

export function useStaff() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: fetchStaff,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInvalidateStaff() {
  const queryClient = useQueryClient();
  return {
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  };
}
