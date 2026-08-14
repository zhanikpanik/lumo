import { useMemo } from 'react';
import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';
import type { InstaQLParams } from '@instantdb/react';
import type { AppSchema } from '@lumo/data';
import { instantOne } from '@/lib/instantLink';

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

function allStockItemsQuery(venueId: string) {
  return {
    stockItems: {
      $: {
        where: { venueId },
        limit: 9999,
      },
      product: {},
      warehouse: {},
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

  const stockItemsResult = db.useQuery(allStockItemsQuery(venueId));

  const data = useMemo(() => {
    const products = ingredientsResult.data?.products ?? [];
    const stockItems = stockItemsResult.data?.stockItems ?? [];
    const stockByProduct = new Map<string, number>();
    const breakdownByProduct = new Map<string, IngredientListItem['warehouse_breakdown']>();

    for (const stockItem of stockItems) {
      const product = instantOne(stockItem.product);
      const warehouse = instantOne(stockItem.warehouse);
      if (!product) continue;
      const quantity = (stockItem.quantityMilli ?? 0) / 1000;
      stockByProduct.set(product.id, (stockByProduct.get(product.id) ?? 0) + quantity);
      if (warehouse) {
        const breakdown = breakdownByProduct.get(product.id) ?? [];
        breakdown.push({
          warehouse_id: warehouse.id,
          warehouse_name: warehouse.name,
          quantity,
        });
        breakdownByProduct.set(product.id, breakdown);
      }
    }

    return products.map(p => ({
      id: p.id,
      name: p.name,
      price: tyinToSom(p.costTiyin ?? 0),
      stock_quantity: stockByProduct.get(p.id) ?? 0,
      unit: p.unit ?? '',
      is_active: p.status === 'active',
      workshop_id: null,
      workshop_name: '',
      warehouse_breakdown: breakdownByProduct.get(p.id) ?? [],
    } satisfies IngredientListItem));
  }, [ingredientsResult.data, stockItemsResult.data]);

  const isLoading = ingredientsResult.isLoading || stockItemsResult.isLoading;
  const error = ingredientsResult.error || stockItemsResult.error;

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
        const ingId = instantOne(ri.ingredient)?.id;
        if (!ingId) continue;
        if (!map[ingId]) map[ingId] = [];
        map[ingId].push({ id: dish.id, name: dish.name });
      }
    }
    return map;
  }, [result.data]);

  return { data, isLoading: result.isLoading, error: result.error };
}
