import { useMemo } from 'react';
import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';
import type { InstaQLParams } from '@instantdb/react';
import type { AppSchema } from '@lumo/data';

export interface IngredientDishRef {
  id: string;
  name: string;
}

export interface IngredientListItem {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  unit: string;
  is_active: boolean;
  workshop_id: string | null;
  workshop_name: string;
  warehouse_breakdown: { warehouse_id: string; warehouse_name: string; quantity: number }[];
}

function allInventoryMovementsQuery(venueId: string) {
  return {
    inventoryMovements: {
      $: {
        where: { 'venue.id': venueId },
        limit: 9999,
      },
      product: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

function tyinToSom(tyin: number): number {
  return tyin / 100;
}

/**
 * Ingredients list with stock computed from inventoryMovements.
 * Does NOT include usage map — use useInstantIngredientUsageMap separately.
 */
export function useInstantIngredientsDetailed() {
  const db = getInstantClient();
  const venueId = useVenueId();

  const ingredientsResult = db.useQuery({
    products: {
      $: {
        where: { kind: 'ingredient' as const, 'venue.id': venueId },
        order: { sortOrder: 'asc' as const },
      },
      category: {},
    },
  } satisfies InstaQLParams<AppSchema>);

  const movementsResult = db.useQuery(allInventoryMovementsQuery(venueId));

  const data = useMemo(() => {
    const products = ingredientsResult.data?.products ?? [];
    const movements = movementsResult.data?.inventoryMovements ?? [];

    const stockByProduct = new Map<string, number>();
    for (const m of movements) {
      const pid = m.product?.id;
      if (!pid) continue;
      stockByProduct.set(pid, (stockByProduct.get(pid) ?? 0) + (m.quantityDeltaMilli ?? 0));
    }

    return products.map(p => {
      const stockMilli = stockByProduct.get(p.id) ?? 0;
      return {
        id: p.id,
        name: p.name,
        price: tyinToSom(p.costTiyin ?? 0),
        stock_quantity: stockMilli / 1000,
        unit: p.unit ?? '',
        is_active: p.status === 'active',
        workshop_id: null,
        workshop_name: '',
        warehouse_breakdown: [],
      } satisfies IngredientListItem;
    });
  }, [ingredientsResult.data, movementsResult.data]);

  const isLoading = ingredientsResult.isLoading || movementsResult.isLoading;
  const error = ingredientsResult.error || movementsResult.error;

  return { data, isLoading, error };
}

/**
 * Returns a map of ingredient_id → list of dishes that use it.
 */
export function useInstantIngredientUsageMap(): {
  data: Record<string, IngredientDishRef[]>;
  isLoading: boolean;
  error: unknown;
} {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery({
    products: {
      $: {
        where: { kind: 'dish' as const, 'venue.id': venueId },
        order: { sortOrder: 'asc' as const },
      },
      recipeItems: { ingredient: {} },
    },
  } satisfies InstaQLParams<AppSchema>);

  const data = useMemo(() => {
    const map: Record<string, IngredientDishRef[]> = {};
    for (const dish of result.data?.products ?? []) {
      for (const ri of dish.recipeItems ?? []) {
        const ingId = ri.ingredient?.id;
        if (!ingId) continue;
        if (!map[ingId]) map[ingId] = [];
        map[ingId].push({ id: dish.id, name: dish.name });
      }
    }
    return map;
  }, [result.data]);

  return { data, isLoading: result.isLoading, error: result.error };
}
