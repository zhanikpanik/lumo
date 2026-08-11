import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';

/**
 * Create a new product (dish).
 */
export function useInstantCreateDish() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const create = useCallback(async (input: {
    name: string;
    priceTiyin: number;
    costTiyin: number;
    categoryId: string | null;
  }) => {
    setLoading(true);
    try {
      const id = crypto.randomUUID();
      const tx = db.tx.products[id]
        .update({
          name: input.name,
          kind: 'dish',
          priceTiyin: input.priceTiyin,
          costTiyin: input.costTiyin,
          sortOrder: 999,
          status: 'active',
          unit: 'порц',
          createdAt: new Date().toISOString(),
        })
        .link({ venue: venueId });

      if (input.categoryId) {
        tx.link({ category: input.categoryId });
      }

      await db.transact(tx);
      return id;
    } finally {
      setLoading(false);
    }
  }, [db, venueId]);

  return { create, loading };
}

/**
 * Update an existing product (dish) fields.
 */
export function useInstantUpdateDish() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const update = useCallback(async (id: string, input: {
    name?: string;
    priceTiyin?: number;
    costTiyin?: number;
    categoryId?: string | null;
  }) => {
    setLoading(true);
    try {
      const patch: Record<string, any> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.priceTiyin !== undefined) patch.priceTiyin = input.priceTiyin;
      if (input.costTiyin !== undefined) patch.costTiyin = input.costTiyin;

      const tx = db.tx.products[id].update(patch);

      if (input.categoryId !== undefined) {
        if (input.categoryId) {
          tx.link({ category: input.categoryId });
        }
        // Note: unlinking a category requires a different approach in InstantDB
      }

      await db.transact(tx);
    } finally {
      setLoading(false);
    }
  }, [db]);

  return { update, loading };
}

/**
 * Add a recipe item to a dish.
 */
export function useInstantAddRecipeItem() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const add = useCallback(async (input: {
    dishId: string;
    ingredientId: string;
    quantityMilli: number;
    unit: string;
  }) => {
    setLoading(true);
    try {
      const id = crypto.randomUUID();
      await db.transact(
        db.tx.recipeItems[id]
          .update({
            quantityMilli: input.quantityMilli,
            unit: input.unit,
            createdAt: new Date().toISOString(),
          })
          .link({ dish: input.dishId, ingredient: input.ingredientId }),
      );
      return id;
    } finally {
      setLoading(false);
    }
  }, [db]);

  return { add, loading };
}

/**
 * Remove a recipe item.
 */
export function useInstantRemoveRecipeItem() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const remove = useCallback(async (recipeItemId: string) => {
    setLoading(true);
    try {
      await db.transact(db.tx.recipeItems[recipeItemId].delete());
    } finally {
      setLoading(false);
    }
  }, [db]);

  return { remove, loading };
}

/**
 * Update a recipe item (change ingredient or unit).
 */
export function useInstantUpdateRecipeItem() {
  const db = getInstantClient();
  const [loading, setLoading] = useState(false);

  const update = useCallback(async (id: string, input: {
    ingredientId?: string;
    quantityMilli?: number;
    unit?: string;
  }) => {
    setLoading(true);
    try {
      const patch: Record<string, any> = {};
      if (input.quantityMilli !== undefined) patch.quantityMilli = input.quantityMilli;
      if (input.unit !== undefined) patch.unit = input.unit;

      const tx = db.tx.recipeItems[id].update(patch);

      if (input.ingredientId) {
        tx.link({ ingredient: input.ingredientId });
      }

      await db.transact(tx);
    } finally {
      setLoading(false);
    }
  }, [db]);

  return { update, loading };
}
