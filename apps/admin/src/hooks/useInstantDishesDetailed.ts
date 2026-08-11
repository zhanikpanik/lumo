import { getInstantClient } from '@/data/instant';
import { adminDishesWithRecipesQuery } from '@lumo/data';
import { useVenueId } from './useVenueId';

export interface DishRecipeLine {
  id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  ingredient_name: string;
  ingredient_cost: number;
}

export interface DishProduct {
  id: string;
  name: string;
  price: number;
  cost_price: number;
  category_id: string;
  workshop_id: string | null;
  output_weight: string | null;
  is_active: boolean;
  has_modifiers: boolean;
  sort_order: number;
  recipe_count: number;
  recipe_items: DishRecipeLine[];
  category_name: string;
  workshop_name: string;
}

/**
 * Compute ingredient cost for a recipe line.
 * quantityMilli is in thousands of the base unit (e.g. 18000 = 18g).
 * costTiyin is the cost per base unit in tiyin (1/100 som).
 * Result in som.
 */
function recipeIngredientCost(quantityMilli: number, costTiyin: number): number {
  const qty = quantityMilli / 1000; // convert milli to base unit
  return (costTiyin / 100) * qty;   // cost in som
}

export function useInstantDishesDetailed() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminDishesWithRecipesQuery(venueId));

  const data: DishProduct[] = (result.data?.products ?? []).map(p => {
    const recipeItems: DishRecipeLine[] = (p.recipeItems ?? []).map(ri => ({
      id: ri.id,
      ingredient_id: ri.ingredient?.id ?? '',
      quantity: (ri.quantityMilli ?? 0) / 1000,
      unit: ri.unit ?? '',
      ingredient_name: ri.ingredient?.name ?? '—',
      ingredient_cost: recipeIngredientCost(ri.quantityMilli ?? 0, ri.ingredient?.costTiyin ?? 0),
    }));

    return {
      id: p.id,
      name: p.name,
      price: (p.priceTiyin ?? 0) / 100,
      cost_price: (p.costTiyin ?? 0) / 100,
      category_id: p.category?.id ?? '',
      workshop_id: null,
      output_weight: null,
      is_active: p.status === 'active',
      has_modifiers: (p.modifierGroups ?? []).length > 0,
      sort_order: p.sortOrder ?? 0,
      recipe_count: recipeItems.length,
      recipe_items: recipeItems,
      category_name: p.category?.name ?? '',
      workshop_name: '',
    };
  });

  return { data, isLoading: result.isLoading, error: result.error };
}
