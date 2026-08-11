import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, VENUE_ID } from '@/lib/supabase';
import { normalizeQuantityToCanonical } from '@/lib/units';

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

async function fetchDish(id: string): Promise<DishDetail> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, cost_price, category_id, workshop_id, output_weight, is_active, has_modifiers')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as DishDetail;
}

async function fetchDishRecipe(dishId: string): Promise<RecipeItem[]> {
  const { data, error } = await supabase
    .from('recipe_items')
    .select('id, ingredient_id, quantity, unit')
    .eq('product_id', dishId);
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const ingIds = data.map((r: any) => r.ingredient_id);
  const { data: ings } = await supabase
    .from('products')
    .select('id, name, cost_price, unit')
    .in('id', ingIds);

  return data.map((r: any) => {
    const ing = ings?.find((i: any) => i.id === r.ingredient_id);
    const qty = Number(r.quantity) || 0;
    const recipeUnit = (r.unit || '') as string;
    const normalized = normalizeQuantityToCanonical(qty, recipeUnit);
    return {
      ...r,
      quantity: normalized.quantity,
      unit: normalized.unit,
      ingredient_name: ing?.name || '—',
      ingredient_price: ing?.cost_price || 0,
      ingredient_unit: ing?.unit || null,
    };
  });
}

async function fetchDishModifierGroups(dishId: string): Promise<ModifierGroup[]> {
  const { data: links } = await supabase
    .from('product_modifier_groups')
    .select('modifier_group_id')
    .eq('product_id', dishId);

  if (!links || links.length === 0) return [];

  const groupIds = links.map((l: any) => l.modifier_group_id);

  const { data: groups } = await supabase
    .from('modifier_groups')
    .select('id, name, is_required, max_select, created_at')
    .in('id', groupIds)
    .order('created_at');

  const { data: mods } = await supabase
    .from('modifiers')
    .select('id, name, price, modifier_group_id, ingredient_id, quantity, unit')
    .in('modifier_group_id', groupIds)
    .order('sort_order');

  return (groups || []).map((g: any) => ({
    ...g,
    modifiers: (mods || []).filter((m: any) => m.modifier_group_id === g.id),
  }));
}

async function fetchIngredients(): Promise<Ingredient[]> {
  const { data } = await supabase
    .from('products')
    .select('id, name, price, cost_price, unit')
    .eq('venue_id', VENUE_ID)
    .eq('type', 'ingredient')
    .order('name');
  return (data || []) as Ingredient[];
}

async function fetchDishModifierIngredients(
  dishId: string,
  workshopIdOverride?: string | null
): Promise<Ingredient[]> {
  let workshopId = workshopIdOverride ?? null;

  if (!workshopId) {
    const { data: dish, error: dishErr } = await supabase
      .from('products')
      .select('workshop_id')
      .eq('id', dishId)
      .maybeSingle();
    if (dishErr) throw dishErr;
    workshopId = (dish as { workshop_id?: string | null } | null)?.workshop_id ?? null;
  }

  if (!workshopId) return [];

  const { data: wwRows, error: wwErr } = await supabase
    .from('workshop_warehouses')
    .select('warehouse_id')
    .eq('workshop_id', workshopId);
  if (wwErr) throw wwErr;

  const warehouseIds = [...new Set((wwRows || []).map((r) => r.warehouse_id as string).filter(Boolean))];
  if (warehouseIds.length === 0) return [];

  const { data: stockRows, error: stockErr } = await supabase
    .from('stock_items')
    .select('product_id')
    .in('warehouse_id', warehouseIds)
    .gt('quantity', 0);
  if (stockErr) throw stockErr;

  const ingredientIds = [...new Set((stockRows || []).map((r) => r.product_id as string).filter(Boolean))];
  if (ingredientIds.length === 0) return [];

  const { data: rows, error } = await supabase
    .from('products')
    .select('id, name, price, unit')
    .eq('venue_id', VENUE_ID)
    .eq('type', 'ingredient')
    .in('id', ingredientIds)
    .order('name');

  if (error) throw error;
  return (rows || []) as Ingredient[];
}

export function useDish(id: string | undefined) {
  return useQuery({
    queryKey: ['dish', id],
    queryFn: () => fetchDish(id!),
    enabled: !!id,
  });
}

export function useDishRecipe(id: string | undefined) {
  return useQuery({
    queryKey: ['dish-recipe', id],
    queryFn: () => fetchDishRecipe(id!),
    enabled: !!id,
  });
}

export function useDishModifiers(id: string | undefined) {
  return useQuery({
    queryKey: ['dish-modifiers', id],
    queryFn: () => fetchDishModifierGroups(id!),
    enabled: !!id,
  });
}

export function useIngredients() {
  return useQuery({
    queryKey: ['ingredients'],
    queryFn: fetchIngredients,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDishModifierIngredients(
  dishId: string | undefined,
  workshopIdOverride?: string | null
) {
  return useQuery({
    queryKey: ['dish-modifier-ingredients', dishId ?? 'none', workshopIdOverride ?? 'auto'],
    queryFn: () => fetchDishModifierIngredients(dishId!, workshopIdOverride),
    enabled: Boolean(dishId),
    staleTime: 60 * 1000,
  });
}

export function useInvalidateDish() {
  const qc = useQueryClient();
  return {
    invalidate: (id: string) => {
      qc.invalidateQueries({ queryKey: ['dish', id] });
      qc.invalidateQueries({ queryKey: ['dish-recipe', id] });
      qc.invalidateQueries({ queryKey: ['dish-modifiers', id] });
      qc.invalidateQueries({ queryKey: ['dish-modifier-ingredients', id] });
      qc.invalidateQueries({ queryKey: ['dishes'] });
    },
    // Optimistic: update recipe cache directly
    removeRecipeItem: (dishId: string, itemId: string) => {
      qc.setQueryData(['dish-recipe', dishId], (old: RecipeItem[] | undefined) =>
        old ? old.filter(r => r.id !== itemId) : []
      );
    },
    addRecipeItem: (dishId: string, item: RecipeItem) => {
      qc.setQueryData(['dish-recipe', dishId], (old: RecipeItem[] | undefined) =>
        old ? [...old, item] : [item]
      );
    },
    removeModifier: (dishId: string, modId: string) => {
      qc.setQueryData(['dish-modifiers', dishId], (old: ModifierGroup[] | undefined) =>
        old ? old.map(g => ({ ...g, modifiers: g.modifiers.filter(m => m.id !== modId) })) : []
      );
    },
    addModifier: (dishId: string, groupId: string, mod: ModifierItem) => {
      qc.setQueryData(['dish-modifiers', dishId], (old: ModifierGroup[] | undefined) =>
        old ? old.map(g => g.id === groupId ? { ...g, modifiers: [...g.modifiers, mod] } : g) : []
      );
    },
    addModGroup: (dishId: string, group: ModifierGroup) => {
      qc.setQueryData(['dish-modifiers', dishId], (old: ModifierGroup[] | undefined) =>
        old ? [...old, group] : [group]
      );
    },
    removeModGroup: (dishId: string, groupId: string) => {
      qc.setQueryData(['dish-modifiers', dishId], (old: ModifierGroup[] | undefined) =>
        old ? old.filter(g => g.id !== groupId) : []
      );
    },
  };
}
