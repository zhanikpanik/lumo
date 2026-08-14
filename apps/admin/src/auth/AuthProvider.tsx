import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { getInstantClient } from '@/data/instant';
import { flushPendingWarehouseCommands } from '@/data/warehouseCommands';
import { flushPendingAdminCommands } from '@/data/adminCommands';
import { AuthContext, type AuthValue } from './auth-context';

const ADMIN_ROLES: Record<string, true> = { owner: true, manager: true };
const PREFERRED_VENUE_ID = import.meta.env.VITE_VENUE_ID;

function linkedVenue(value: unknown): { id: string; name: string } | null {
  const linked = Array.isArray(value) ? value[0] : value;
  if (!linked || typeof linked !== 'object' || !('id' in linked) || typeof linked.id !== 'string') {
    return null;
  }
  return {
    id: linked.id,
    name: 'name' in linked && typeof linked.name === 'string' ? linked.name : 'Заведение',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = getInstantClient();
  const { user, isLoading, error } = db.useAuth();
  const membershipResult = db.useQuery({
    $users: {
      $: { where: { id: user?.id ?? '__signed_out__' } },
      memberships: { venue: {} },
    },
  });

  const selectedVenue = useMemo(() => {
    const memberships = (membershipResult.data?.$users?.[0]?.memberships ?? []) as Array<{
      status?: string;
      role?: string;
      createdAt?: string;
      venue?: unknown;
    }>;

    const venues = memberships
      .filter((membership) => membership.status === 'active' && ADMIN_ROLES[membership.role ?? ''] === true)
      .sort((left, right) => (left.createdAt ?? '').localeCompare(right.createdAt ?? ''))
      .map((membership) => linkedVenue(membership.venue))
      .filter((venue): venue is { id: string; name: string } => venue !== null);
    return venues.find((venue) => venue.id === PREFERRED_VENUE_ID) ?? venues[0] ?? null;
  }, [membershipResult.data]);
  const venueId = selectedVenue?.id ?? null;
  const venueName = selectedVenue?.name ?? null;

  useEffect(() => {
    if (user) {
      void flushPendingWarehouseCommands();
      void flushPendingAdminCommands();
    }
  }, [user]);

  const requestMagicCode = useCallback(async (email: string) => {
    await db.auth.sendMagicCode({ email });
  }, [db]);

  const verifyMagicCode = useCallback(async (email: string, code: string) => {
    await db.auth.signInWithMagicCode({ email, code });
  }, [db]);

  const signOut = useCallback(async () => {
    await db.auth.signOut();
  }, [db]);

  const value = useMemo<AuthValue>(
    () => ({
      isAuthenticated: Boolean(user),
      loading: isLoading,
      membershipLoading: Boolean(user) && membershipResult.isLoading,
      venueId,
      venueName,
      authError: error instanceof Error ? error : null,
      requestMagicCode,
      verifyMagicCode,
      signOut,
    }),
    [
      error,
      isLoading,
      membershipResult.isLoading,
      requestMagicCode,
      signOut,
      user,
      venueId,
      venueName,
      verifyMagicCode,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
