import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';

export function useInstantCreateCategory() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      await db.transact(
        db.tx.categories[id].update({
          name,
          color: '#4A2C2A',
          sortOrder: 999,
          status: 'active',
          createdAt: new Date().toISOString(),
        }).link({ venue: venueId }),
      );
      return id;
    } catch (e) {
      setError(e as Error);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [db, venueId]);

  return { create, loading, error };
}
