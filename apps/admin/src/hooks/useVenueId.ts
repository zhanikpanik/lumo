import { useAuth } from '@/auth/useAuth';

/** Returns the authenticated admin's selected venue. AuthGate guarantees it exists. */
export function useVenueId(): string {
  const { venueId } = useAuth();
  if (!venueId) throw new Error('Venue access is required');
  return venueId;
}
