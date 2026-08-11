import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';
import { createWarehouse, updateWarehouse } from '@lumo/data';
import type { CreateWarehouseInput, UpdateWarehousePatch } from '@lumo/data';

export function useInstantCreateWarehouse() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const create = useCallback(
    async (input: Omit<CreateWarehouseInput, 'venueId'>) => {
      setLoading(true);
      try {
        const cmd = createWarehouse(db, { ...input, venueId });
        const result = await cmd.execute();
        return result.warehouseId;
      } finally {
        setLoading(false);
      }
    },
    [db, venueId],
  );

  return { create, loading };
}

export function useInstantUpdateWarehouse() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const update = useCallback(
    async (id: string, patch: UpdateWarehousePatch) => {
      setLoading(true);
      try {
        const cmd = updateWarehouse(db, id, patch);
        await cmd.execute();
      } finally {
        setLoading(false);
      }
    },
    [db],
  );

  return { update, loading };
}

export function useInstantDeleteWarehouse() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const remove = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        await db.transact(db.tx.warehouses[id].delete());
      } finally {
        setLoading(false);
      }
    },
    [db],
  );

  return { remove, loading };
}
