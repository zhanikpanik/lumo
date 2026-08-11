import { useMemo } from 'react';
import { getInstantClient, getVenueId } from '../data/instant';

export interface InstantCategory {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface InstantProduct {
  id: string;
  name: string;
  kind: string;
  priceTiyin: number;
  costTiyin: number;
  unit: string;
  sortOrder: number;
  categoryId?: string;
  modifierGroups: InstantModifierGroup[];
  recipeItems: InstantRecipeItem[];
}

export interface InstantRecipeItem {
  id: string;
  quantityMilli: number;
  unit: string;
  ingredient: { id: string; name: string; costTiyin: number; unit: string };
}

export interface InstantModifierGroup {
  id: string;
  name: string;
  maxSelect: number;
  isRequired: boolean;
  sortOrder: number;
  modifiers: InstantModifier[];
}

export interface InstantModifier {
  id: string;
  name: string;
  priceTiyin: number;
  sortOrder: number;
}

export interface InstantMenuData {
  categories: InstantCategory[];
  products: Record<string, InstantProduct>;
  allProducts: InstantProduct[];
  isLoading: boolean;
  error: unknown;
}

// ── Raw InstantDB row types (narrower than AppSchema entities) ──
interface MenuCategoryRow { id: string; name: string; color: string; sortOrder: number }
interface MenuProductRow { id: string; name: string; kind: string; priceTiyin: number; costTiyin: number; unit: string; sortOrder: number; category?: { id: string }[]; modifierGroups?: MenuModifierGroupRow[]; recipeItems?: MenuRecipeItemRow[] }
interface MenuModifierGroupRow { id: string; name: string; maxSelect: number; isRequired: boolean; sortOrder: number; modifiers?: MenuModifierRow[] }
interface MenuModifierRow { id: string; name: string; priceTiyin: number; sortOrder: number }
interface MenuRecipeItemRow { id: string; quantityMilli: number; unit: string; ingredient?: MenuIngredientRow[] }
interface MenuIngredientRow { id: string; name: string; costTiyin?: number; unit?: string }

// ── Query result type matching our query shape ──
interface MenuQueryResult {
  categories?: MenuCategoryRow[];
  products?: MenuProductRow[];
}

/**
 * Live menu data from InstantDB. Replaces the imperative Supabase queries
 * in menuStore with reactive queries — no fingerprint cache, no TTL,
 * no manual refresh.
 */
export function useInstantMenu(): InstantMenuData {
  const db = getInstantClient();
  const venueId = getVenueId();
  const { data, isLoading, error } = db.useQuery({
    categories: {
      $: {
        where: { venue: venueId, status: 'active' },
        order: { sortOrder: 'asc' },
      },
    },
    products: {
      $: {
        where: { venue: venueId, status: 'active', kind: 'dish' },
        order: { sortOrder: 'asc' },
      },
      category: {},
      modifierGroups: {
        $: { order: { sortOrder: 'asc' } },
        modifiers: {
          $: { order: { sortOrder: 'asc' } },
        },
      },
      recipeItems: {
        ingredient: {},
      },
    },
  });


  // InstantDB query results have broad index-signature types;
  // cast once to our known row shapes.
  const rows = data as MenuQueryResult | undefined;

  const categories: InstantCategory[] = useMemo(() => {
    if (!rows?.categories) return [];
    return rows.categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      sortOrder: c.sortOrder,
    }));
  }, [rows?.categories]);

  const allProducts: InstantProduct[] = useMemo(() => {
    if (!rows?.products) return [];
    return rows.products.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      priceTiyin: p.priceTiyin,
      costTiyin: p.costTiyin,
      unit: p.unit,
      sortOrder: p.sortOrder,
      categoryId: p.category?.[0]?.id,
      modifierGroups: (p.modifierGroups ?? []).map((mg) => ({
        id: mg.id,
        name: mg.name,
        maxSelect: mg.maxSelect,
        isRequired: mg.isRequired,
        sortOrder: mg.sortOrder,
        modifiers: (mg.modifiers ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          priceTiyin: m.priceTiyin,
          sortOrder: m.sortOrder,
        })),
      })),
      recipeItems: (p.recipeItems ?? []).map((ri) => ({
        id: ri.id,
        quantityMilli: ri.quantityMilli,
        unit: ri.unit,
        ingredient: {
          id: ri.ingredient?.[0]?.id ?? '',
          name: ri.ingredient?.[0]?.name ?? '',
          costTiyin: ri.ingredient?.[0]?.costTiyin ?? 0,
          unit: ri.ingredient?.[0]?.unit ?? '',
        },
      })),
    }));
  }, [rows?.products]);

  const products: Record<string, InstantProduct> = useMemo(() => {
    const map: Record<string, InstantProduct> = {};
    for (const p of allProducts) {
      map[p.id] = p;
    }
    return map;
  }, [allProducts]);

  return { categories, products, allProducts, isLoading, error };
}
