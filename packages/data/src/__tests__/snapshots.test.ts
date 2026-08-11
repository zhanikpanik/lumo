import assert from 'node:assert/strict';
import test from 'node:test';
import { deterministicId } from '../ids.js';
import { parseOrderLineSnapshot, serializeOrderLineSnapshot } from '../snapshots.js';

test('reuses the same ledger ID when a payment operation is retried', () => {
  const first = deterministicId('inventory-movement', 'order-1', 'line-1', 'beans-1', 'sale');
  const retry = deterministicId('inventory-movement', 'order-1', 'line-1', 'beans-1', 'sale');

  assert.equal(retry, first);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('rejects a corrupted persisted consumption snapshot before payment', () => {
  assert.throws(
    () => parseOrderLineSnapshot('{"consumption":[{"ingredientId":"beans","quantityMilli":0,"unit":"g"}]}'),
    /invalid/i,
  );
});

test('round-trips an immutable line consumption snapshot with cost fields', () => {
  const snapshot = serializeOrderLineSnapshot({
    consumption: [
      {
        ingredientId: 'beans',
        quantityMilli: 18_000,
        unit: 'g',
        ingredientUnit: 'kg',
        unitCostTiyin: 50_000,
        costTiyin: 900,
      },
      {
        ingredientId: 'milk',
        quantityMilli: 200_000,
        unit: 'ml',
        ingredientUnit: 'l',
        unitCostTiyin: 8000,
        costTiyin: 1600,
      },
    ],
  });

  assert.deepEqual(parseOrderLineSnapshot(snapshot), {
    consumption: [
      {
        ingredientId: 'beans',
        quantityMilli: 18_000,
        unit: 'g',
        ingredientUnit: 'kg',
        unitCostTiyin: 50_000,
        costTiyin: 900,
      },
      {
        ingredientId: 'milk',
        quantityMilli: 200_000,
        unit: 'ml',
        ingredientUnit: 'l',
        unitCostTiyin: 8000,
        costTiyin: 1600,
      },
    ],
  });
});
