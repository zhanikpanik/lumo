export type SnapshotValue =
  | null
  | boolean
  | number
  | string
  | readonly SnapshotValue[]
  | { readonly [key: string]: SnapshotValue };

/** Produces a detached JSON-safe snapshot with stable object-key ordering. */
export function snapshotOf(value: SnapshotValue): SnapshotValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Snapshots cannot contain non-finite numbers');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(snapshotOf);
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, snapshotOf(item)]),
  );
}

export function serializeSnapshot(value: SnapshotValue): string {
  return JSON.stringify(snapshotOf(value));
}

export interface ConsumptionSnapshotLine {
  /** Stable ingredient ID. */
  ingredientId: string;
  /** Consumption quantity in milligrams or microliters (1000× base unit). */
  quantityMilli: number;
  /** Unit of the recipe item ("g", "ml", "unit"). */
  unit: string;
  /** Base unit of the ingredient ("g", "ml", "unit" — may also be "kg", "l"). */
  ingredientUnit: string;
  /** Cost of one base unit of the ingredient at the time the line was added, in tiyin. */
  unitCostTiyin: number;
  /** Total cost of this consumption line after unit conversion, in tiyin. */
  costTiyin: number;
}

export interface OrderLineSnapshot {
  consumption: readonly ConsumptionSnapshotLine[];
}

function isConsumptionLine(value: unknown): value is ConsumptionSnapshotLine {
  if (
    !value
    || typeof value !== 'object'
    || !('ingredientId' in value)
    || !('quantityMilli' in value)
    || !('unit' in value)
    || !('ingredientUnit' in value)
    || !('unitCostTiyin' in value)
    || !('costTiyin' in value)
  ) {
    return false;
  }

  return typeof value.ingredientId === 'string'
    && typeof value.quantityMilli === 'number'
    && Number.isInteger(value.quantityMilli)
    && value.quantityMilli > 0
    && typeof value.unit === 'string'
    && value.unit.length > 0
    && typeof value.ingredientUnit === 'string'
    && value.ingredientUnit.length > 0
    && typeof value.unitCostTiyin === 'number'
    && Number.isInteger(value.unitCostTiyin)
    && value.unitCostTiyin >= 0
    && typeof value.costTiyin === 'number'
    && Number.isInteger(value.costTiyin)
    && value.costTiyin >= 0;
}

function isOrderLineSnapshot(value: unknown): value is OrderLineSnapshot {
  return Boolean(
    value
    && typeof value === 'object'
    && 'consumption' in value
    && Array.isArray(value.consumption)
    && value.consumption.every(isConsumptionLine),
  );
}

/** Serializes the immutable stock-consumption input captured with an order line. */
export function serializeOrderLineSnapshot(snapshot: OrderLineSnapshot): string {
  if (!Array.isArray(snapshot.consumption) || !snapshot.consumption.every(isConsumptionLine)) {
    throw new TypeError('Order line consumption snapshot is invalid');
  }

  const stableValue: SnapshotValue = {
    consumption: snapshot.consumption.map((line) => ({
      costTiyin: line.costTiyin,
      ingredientId: line.ingredientId,
      ingredientUnit: line.ingredientUnit,
      quantityMilli: line.quantityMilli,
      unit: line.unit,
      unitCostTiyin: line.unitCostTiyin,
    })),
  };
  return serializeSnapshot(stableValue);
}

/** Parses a persisted order-line snapshot before payment creates inventory ledger rows. */
export function parseOrderLineSnapshot(serialized: string): OrderLineSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new TypeError('Order line consumption snapshot is not valid JSON');
  }

  if (!isOrderLineSnapshot(parsed)) {
    throw new TypeError('Order line consumption snapshot is invalid');
  }

  return parsed;
}
