import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';

export function useInstantCreateCategory() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const create = useCallback(async (name: string) => {
    setLoading(true);
    try {
      const id = crypto.randomUUID();
      await db.transact(
        db.tx.categories[id].update({
          name, color: '#4A2C2A', sortOrder: 999,
          status: 'active', createdAt: new Date().toISOString(),
        }).link({ venue: venueId }),
      );
      return id;
    } finally { setLoading(false); }
  }, [db, venueId]);

  return { create, loading };
}

export function useInstantRenameCategory() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const rename = useCallback(async (id: string, name: string) => {
    setLoading(true);
    try {
      await db.transact(db.tx.categories[id].update({ name }));
    } finally { setLoading(false); }
  }, [db]);

  return { rename, loading };
}

export function useInstantDeleteCategory() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const remove = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await db.transact(db.tx.categories[id].delete());
    } finally { setLoading(false); }
  }, [db]);

  return { remove, loading };
}
