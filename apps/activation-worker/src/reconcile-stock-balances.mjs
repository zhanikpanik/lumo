import { init } from '@instantdb/admin';
import { deterministicId, instantSchema } from '@lumo/data';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
const apply = process.argv.includes('--apply');
const db = init({ appId, adminToken, schema: instantSchema });

const linked = (value) => Array.isArray(value) ? value[0] : value;
const keyFor = (warehouseId, productId) => `${warehouseId}:${productId}`;
const openingIdFor = (stockId) => deterministicId('warehouse-stock-opening-v1', stockId);

const data = await db.query({
  stockItems: { warehouse: {}, product: {} },
  inventoryMovements: { warehouse: {}, product: {} },
});
const warehouseMovements = data.inventoryMovements.filter((movement) => linked(movement.warehouse)?.id);
const movementTotals = new Map();
const movementIds = new Set();
for (const movement of warehouseMovements) {
  const warehouseId = linked(movement.warehouse)?.id;
  const productId = linked(movement.product)?.id;
  if (!warehouseId || !productId) continue;
  const key = keyFor(warehouseId, productId);
  movementTotals.set(key, (movementTotals.get(key) ?? 0) + movement.quantityDeltaMilli);
  movementIds.add(movement.id);
}

const now = new Date().toISOString();
const candidates = [];
const invalid = [];
for (const stock of data.stockItems) {
  const warehouseId = linked(stock.warehouse)?.id;
  const productId = linked(stock.product)?.id;
  if (!warehouseId || !productId) {
    invalid.push({ stockId: stock.id, issue: 'missing warehouse or product link' });
    continue;
  }
  if (!Number.isSafeInteger(stock.quantityMilli) || stock.quantityMilli < 0) {
    invalid.push({ stockId: stock.id, issue: 'invalid quantityMilli', value: stock.quantityMilli });
    continue;
  }
  const openingId = openingIdFor(stock.id);
  const movementTotal = movementTotals.get(keyFor(warehouseId, productId)) ?? 0;
  if (!movementIds.has(openingId)) {
    candidates.push({ stock, warehouseId, productId, openingId, openingDeltaMilli: stock.quantityMilli - movementTotal });
  } else if (movementTotal !== stock.quantityMilli) {
    invalid.push({ stockId: stock.id, issue: 'movement total differs from stock', stockQuantityMilli: stock.quantityMilli, movementTotalMilli: movementTotal });
  }
}

if (apply && candidates.length > 0 && invalid.length === 0) {
  const operations = candidates.map(({ stock, warehouseId, productId, openingId, openingDeltaMilli }) =>
    db.tx.inventoryMovements[openingId]
      .update({
        venueId: stock.venueId,
        operationId: openingId,
        quantityDeltaMilli: openingDeltaMilli,
        unit: stock.unit,
        reason: 'opening_balance',
        lineIdempotencyKey: openingId,
        metadata: { stockId: stock.id, stockVersionAtBackfill: stock.version },
        occurredAt: now,
        createdAt: now,
      })
      .link({ venue: stock.venueId, warehouse: warehouseId, product: productId }));
  for (let offset = 0; offset < operations.length; offset += 100) {
    await db.transact(operations.slice(offset, offset + 100));
  }
}

const status = invalid.length > 0 ? 'mismatch' : (!apply && candidates.length > 0 ? 'needs_backfill' : 'ok');
console.log(JSON.stringify({
  status,
  apply,
  stockItems: data.stockItems.length,
  warehouseMovements: warehouseMovements.length,
  openingBalancesCreated: apply ? candidates.length : 0,
  pendingOpeningBalances: apply ? 0 : candidates.length,
  invalid,
}, null, 2));
if (status !== 'ok') process.exitCode = 2;
