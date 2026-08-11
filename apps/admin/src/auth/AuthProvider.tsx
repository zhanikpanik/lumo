import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { getInstantClient } from '@/data/instant';
import { flushPendingWarehouseCommands } from '@/data/warehouseCommands';
import { flushPendingAdminCommands } from '@/data/adminCommands';
import { AuthContext, type AuthValue } from './auth-context';

const ADMIN_ROLES: Record<string, true> = { owner: true, manager: true };

function linkedId(value: unknown): string | null {
  const linked = Array.isArray(value) ? value[0] : value;
  return linked && typeof linked === 'object' && 'id' in linked && typeof linked.id === 'string'
    ? linked.id
    : null;
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

  const venueId = useMemo(() => {
    const memberships = (membershipResult.data?.$users?.[0]?.memberships ?? []) as Array<{
      status?: string;
      role?: string;
      createdAt?: string;
      venue?: unknown;
    }>;

    return memberships
      .filter((membership) => membership.status === 'active' && ADMIN_ROLES[membership.role ?? ''] === true)
      .sort((left, right) => (left.createdAt ?? '').localeCompare(right.createdAt ?? ''))
      .map((membership) => linkedId(membership.venue))
      .find((id): id is string => id !== null) ?? null;
  }, [membershipResult.data]);

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
      verifyMagicCode,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
