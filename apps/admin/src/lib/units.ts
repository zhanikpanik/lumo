export type CanonicalUnit = 'г' | 'мл' | 'шт';

function normalizeUnit(unit: string | null | undefined): string {
  return (unit || '').trim().toLowerCase();
}

export function canonicalUnitFromIngredient(unit: string | null | undefined): CanonicalUnit {
  const u = normalizeUnit(unit);
  if (u === 'мл' || u === 'ml' || u === 'л' || u === 'l') return 'мл';
  if (u === 'шт' || u === 'pc' || u === 'шт.') return 'шт';
  return 'г';
}

export function normalizeQuantityToCanonical(
  quantity: number,
  unit: string | null | undefined
): { quantity: number; unit: CanonicalUnit } {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const u = normalizeUnit(unit);

  if (u === 'кг' || u === 'kg') return { quantity: q * 1000, unit: 'г' };
  if (u === 'л' || u === 'l') return { quantity: q * 1000, unit: 'мл' };
  if (u === 'г' || u === 'g') return { quantity: q, unit: 'г' };
  if (u === 'мл' || u === 'ml') return { quantity: q, unit: 'мл' };
  if (u === 'шт' || u === 'pc' || u === 'шт.') return { quantity: q, unit: 'шт' };

  return { quantity: q, unit: canonicalUnitFromIngredient(unit) };
}

export function ingredientCostForRecipeItem(input: {
  ingredientPrice: number;
  ingredientUnit: string | null | undefined;
  recipeQuantity: number;
  recipeUnit: string | null | undefined;
}): number {
  const price = Number(input.ingredientPrice) || 0;
  const baseIngredient = canonicalUnitFromIngredient(input.ingredientUnit);
  const normalized = normalizeQuantityToCanonical(input.recipeQuantity, input.recipeUnit);

  if (baseIngredient === 'шт') return price * normalized.quantity;
  return price * (normalized.quantity / 1000);
}
