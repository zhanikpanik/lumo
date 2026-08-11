/**
 * Unit conversion and line-cost helpers for recipe cost snapshots.
 *
 * ## Unit convention
 *
 * All units are normalized to short lowercase codes:
 *   - "g"  — grams
 *   - "ml" — milliliters
 *   - "unit" — pieces
 *
 * Recipe quantities use milli-units (quantityMilli):
 *   - 1 g = 1000 milli, 1 ml = 1000 milli, 1 unit = 1000 milli
 *
 * Ingredient cost (`products.costTiyin`) is per the ingredient's base unit.
 * The ingredient's `unit` field tells us whether that base unit is g, ml, or unit.
 */

/** Supported unit pairs and their conversion factors. */
const CONVERSION_FACTORS: Record<string, Record<string, number>> = {
  g: { g: 1, kg: 0.001 },
  kg: { g: 1000, kg: 1 },
  ml: { ml: 1, l: 0.001 },
  l: { ml: 1000, l: 1 },
  unit: { unit: 1 },
};

/**
 * Returns the factor to convert `fromUnit` to `toUnit`.
 *
 * @throws if the unit pair is not supported (e.g. g → ml).
 */
export function unitConversionFactor(fromUnit: string, toUnit: string): number {
  const from = fromUnit.toLowerCase().trim();
  const to = toUnit.toLowerCase().trim();
  const factor = CONVERSION_FACTORS[from]?.[to];
  if (factor == null) {
    throw new Error(
      `Unsupported unit conversion: ${fromUnit} → ${toUnit}. ` +
      'Only mass↔mass (g↔kg), volume↔volume (ml↔l), and piece↔piece (unit) are allowed.',
    );
  }
  return factor;
}

/**
 * Computes the total cost in tiyin for a recipe line.
 *
 * ## Formula
 *
 *   costTiyin = round(recipeQtyInBaseUnits × ingredientUnitCostTiyin)
 *
 * where recipeQtyInBaseUnits = (quantityMilli / 1000) × conversionFactor(recipeUnit, ingredientUnit)
 *
 * ## Integer safety
 *
 * Intermediate division is done first to keep the product within safe integer range.
 * The result is always a safe non-negative integer.
 *
 * @param quantityMilli     Recipe quantity in milli-units (mg, μl, or milli-pieces).
 * @param recipeUnit        Unit of the recipe item ("g", "ml", "unit").
 * @param ingredientUnit    Base unit of the ingredient ("g", "ml", "unit" — may also be "kg", "l").
 * @param ingredientUnitCostTiyin  Cost of one base unit of the ingredient, in tiyin.
 *
 * @throws if the unit pair is unsupported or the result is not a safe integer.
 */
export function computeLineCostTiyin(
  quantityMilli: number,
  recipeUnit: string,
  ingredientUnit: string,
  ingredientUnitCostTiyin: number,
): number {
  if (!Number.isSafeInteger(quantityMilli) || quantityMilli <= 0) {
    throw new Error(`quantityMilli must be a positive safe integer, got ${quantityMilli}`);
  }
  if (!Number.isSafeInteger(ingredientUnitCostTiyin) || ingredientUnitCostTiyin < 0) {
    throw new Error(`ingredientUnitCostTiyin must be a non-negative safe integer, got ${ingredientUnitCostTiyin}`);
  }

  const factor = unitConversionFactor(recipeUnit, ingredientUnit);

  // recipeQtyInBaseUnits = (quantityMilli / 1000) × factor
  // costTiyin = recipeQtyInBaseUnits × ingredientUnitCostTiyin
  //
  // Compute as: round(quantityMilli × ingredientUnitCostTiyin × factor / 1000)
  //
  // For g→g (factor=1):  round(quantityMilli × cost / 1000)
  // For g→kg (factor=0.001): round(quantityMilli × cost / 1_000_000)
  // For kg→g (factor=1000):  round(quantityMilli × cost × 1000 / 1000) = round(quantityMilli × cost)

  // Use integer math: multiply first, then divide
  const numerator = quantityMilli * ingredientUnitCostTiyin;
  const denominator = factor < 1
    ? Math.round(1000 / factor)  // 0.001 → 1_000_000, so denominator = 1_000_000
    : 1000 / factor;              // 1 → 1000, 1000 → 1

  const costTiyin = Math.round(numerator / denominator);

  if (!Number.isSafeInteger(costTiyin) || costTiyin < 0) {
    throw new Error(
      `Computed line cost is not a safe integer: ${costTiyin} ` +
      `(qtyMilli=${quantityMilli}, unitCost=${ingredientUnitCostTiyin}, ` +
      `${recipeUnit}→${ingredientUnit})`,
    );
  }

  return costTiyin;
}
