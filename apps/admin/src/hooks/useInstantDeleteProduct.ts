import { getInstantClient } from '@/data/instant';
import { useState, useCallback } from 'react';

/**
 * Soft-delete a product by setting its status to 'deleted'.
 * InstantDB does not support hard deletes via the client SDK — soft delete is the pattern.
 */
export function useInstantDeleteProduct() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const remove = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await db.transact(
        db.tx.products[id].update({ status: 'deleted' }),
      );
    } finally {
      setLoading(false);
    }
  }, [db]);

  return { remove, loading };
}

/**
 * Restore a soft-deleted product by setting its status back to 'active'.
 */
export function useInstantRestoreProduct() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const restore = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await db.transact(
        db.tx.products[id].update({ status: 'active' }),
      );
    } finally {
      setLoading(false);
    }
  }, [db]);

  return { restore, loading };
}
