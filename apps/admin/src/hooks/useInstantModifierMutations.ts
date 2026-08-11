import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';

/**
 * Create a modifier group and link it to a product (dish).
 */
export function useInstantCreateModifierGroup() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const create = useCallback(async (input: {
    name: string;
    dishId: string;
    maxSelect?: number;
  }) => {
    setLoading(true);
    try {
      const id = crypto.randomUUID();
      await db.transact(
        db.tx.modifierGroups[id]
          .update({
            name: input.name,
            maxSelect: input.maxSelect ?? 0,
            isRequired: false,
            sortOrder: 999,
            status: 'active',
            createdAt: new Date().toISOString(),
          })
          .link({ venue: venueId, products: input.dishId }),
      );
      return id;
    } finally {
      setLoading(false);
    }
  }, [db, venueId]);

  return { create, loading };
}

/**
 * Unlink a modifier group from a product (and optionally clean up).
 */
export function useInstantUnlinkModifierGroup() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const unlink = useCallback(async (groupId: string, dishId: string) => {
    setLoading(true);
    try {
      // In InstantDB, unlink uses tx.entity[id].unlink({ relation: targetId })
      await db.transact(
        db.tx.modifierGroups[groupId].unlink({ products: dishId }),
      );
    } finally {
      setLoading(false);
    }
  }, [db]);

  return { unlink, loading };
}

/**
 * Update modifier group max_select.
 */
export function useInstantUpdateModifierGroup() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const update = useCallback(async (id: string, patch: {
    maxSelect?: number;
    name?: string;
  }) => {
    setLoading(true);
    try {
      await db.transact(
        db.tx.modifierGroups[id].update(patch),
      );
    } finally {
      setLoading(false);
    }
  }, [db]);

  return { update, loading };
}

/**
 * Create a modifier within a group.
 */
export function useInstantCreateModifier() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const create = useCallback(async (input: {
    groupId: string;
    name: string;
    priceTiyin: number;
  }) => {
    setLoading(true);
    try {
      const id = crypto.randomUUID();
      await db.transact(
        db.tx.modifiers[id]
          .update({
            name: input.name,
            priceTiyin: input.priceTiyin,
            sortOrder: 999,
            status: 'active',
            createdAt: new Date().toISOString(),
          })
          .link({ group: input.groupId }),
      );
      return id;
    } finally {
      setLoading(false);
    }
  }, [db]);

  return { create, loading };
}

/**
 * Update a modifier.
 */
export function useInstantUpdateModifier() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const update = useCallback(async (id: string, patch: {
    name?: string;
    priceTiyin?: number;
  }) => {
    setLoading(true);
    try {
      await db.transact(
        db.tx.modifiers[id].update(patch),
      );
    } finally {
      setLoading(false);
    }
  }, [db]);

  return { update, loading };
}

/**
 * Delete a modifier.
 */
export function useInstantDeleteModifier() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const remove = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await db.transact(db.tx.modifiers[id].delete());
    } finally {
      setLoading(false);
    }
  }, [db]);

  return { remove, loading };
}
