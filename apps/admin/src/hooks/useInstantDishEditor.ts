import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';
import type { InstaQLParams } from '@instantdb/react';
import type { AppSchema } from '@lumo/data';
import { instantOne } from '@/lib/instantLink';

// ─── Types (compatible with useDishData.ts) ────────────────────────

export interface DishDetail {
  id: string;
  name: string;
  price: number;
  cost_price: number;
  category_id: string | null;
  workshop_id: string | null;
  output_weight: string | null;
  is_active: boolean;
  has_modifiers: boolean;
}

export interface RecipeItem {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  ingredient_price: number;
  ingredient_unit: string | null;
  quantity: number;
  unit: string;
}

export interface ModifierItem {
  id: string;
  name: string;
  price: number;
  ingredient_id: string | null;
  quantity: number | null;
  unit: string | null;
}

export interface ModifierGroup {
  id: string;
  name: string;
  is_required: boolean;
  max_select: number;
  modifiers: ModifierItem[];
}

export interface Ingredient {
  id: string;
  name: string;
  price: number;
  cost_price: number;
  unit: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────

function tyinToSom(tyin: number): number {
  return tyin / 100;
}

// ─── Single dish query ────────────────────────────────────────────

function dishQuery(dishId: string, venueId: string) {
  return {
    products: {
      $: { where: { id: dishId, 'venue.id': venueId } },
      category: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

export function useInstantDish(id: string | undefined) {
  const db = getInstantClient();
  const venueId = useVenueId();

  const result = db.useQuery(id ? dishQuery(id, venueId) : null);
  const product = result.data?.products?.[0];

  const category = instantOne(product?.category);
  const data: DishDetail | undefined = product ? {
    id: product.id,
    name: product.name,
    price: tyinToSom(product.priceTiyin ?? 0),
    cost_price: tyinToSom(product.costTiyin ?? 0),
    category_id: category?.id ?? null,
    workshop_id: null,
    output_weight: null,
    is_active: product.status === 'active',
    has_modifiers: false,
  } : undefined;

  return { data, isLoading: result.isLoading, error: result.error };
}

// ─── Recipe items query ───────────────────────────────────────────

function dishRecipeQuery(dishId: string, venueId: string) {
  return {
    products: {
      $: { where: { id: dishId, 'venue.id': venueId } },
      recipeItems: {
        ingredient: {},
      },
    },
  } satisfies InstaQLParams<AppSchema>;
}

export function useInstantDishRecipe(dishId: string | undefined) {
  const db = getInstantClient();
  const venueId = useVenueId();

  const result = db.useQuery(dishId ? dishRecipeQuery(dishId, venueId) : null);
  const product = result.data?.products?.[0];

  const data: RecipeItem[] = (product?.recipeItems ?? []).map(ri => {
    const ingredient = instantOne(ri.ingredient);
    return {
      id: ri.id,
      ingredient_id: ingredient?.id ?? '',
      ingredient_name: ingredient?.name ?? '—',
      ingredient_price: tyinToSom(ingredient?.costTiyin ?? 0),
      ingredient_unit: ingredient?.unit ?? null,
      quantity: (ri.quantityMilli ?? 0) / 1000,
      unit: ri.unit ?? '',
    };
  });

  return { data, isLoading: result.isLoading, error: result.error };
}

// ─── Modifier groups query ────────────────────────────────────────

function dishModifiersQuery(dishId: string, venueId: string) {
  return {
    products: {
      $: { where: { id: dishId, 'venue.id': venueId } },
      modifierGroups: {
        modifiers: {},
      },
    },
  } satisfies InstaQLParams<AppSchema>;
}

export function useInstantDishModifiers(dishId: string | undefined) {
  const db = getInstantClient();
  const venueId = useVenueId();

  const result = db.useQuery(dishId ? dishModifiersQuery(dishId, venueId) : null);
  const product = result.data?.products?.[0];

  const data: ModifierGroup[] = (product?.modifierGroups ?? []).map(mg => ({
    id: mg.id,
    name: mg.name,
    is_required: mg.isRequired ?? false,
    max_select: mg.maxSelect ?? 0,
    modifiers: (mg.modifiers ?? []).map(m => ({
      id: m.id,
      name: m.name,
      price: tyinToSom(m.priceTiyin ?? 0),
      ingredient_id: null,
      quantity: null,
      unit: null,
    })),
  }));

  return { data, isLoading: result.isLoading, error: result.error };
}

// ─── All ingredients (for pickers) ─────────────────────────────────

export function useInstantIngredients_list() {
  const db = getInstantClient();
  const venueId = useVenueId();

  const result = db.useQuery({
    products: {
      $: { where: { kind: 'ingredient' as const, 'venue.id': venueId } },
    },
  } satisfies InstaQLParams<AppSchema>);

  const data: Ingredient[] = (result.data?.products ?? []).map(p => ({
    id: p.id,
    name: p.name,
    price: tyinToSom(p.priceTiyin ?? 0),
    cost_price: tyinToSom(p.costTiyin ?? 0),
    unit: p.unit ?? null,
  }));

  return { data, isLoading: result.isLoading, error: result.error };
}
