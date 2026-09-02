import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { init } from '@instantdb/admin';
import { instantSchema } from '@lumo/data';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
process.env.PORT = process.env.WAREHOUSE_HTTP_TEST_PORT ?? '3103';

async function retrySetup(action) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!Number.isInteger(error?.status) || error.status < 500 || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

const db = init({ appId, adminToken, schema: instantSchema });
const runId = randomUUID();
const now = new Date().toISOString();
const organizationId = randomUUID();
const venueId = randomUUID();
const membershipId = randomUUID();
const sourceWarehouseId = randomUUID();
const destinationWarehouseId = randomUUID();
const productAId = randomUUID();
const productBId = randomUUID();
const ownerEmail = `warehouse-http-${runId}@alto-coffee.test`;
const ownerToken = await retrySetup(() => db.auth.createToken({ email: ownerEmail }));
const owner = await retrySetup(() => db.auth.getUser({ email: ownerEmail }));
if (!owner) throw new Error('Could not create warehouse fixture owner');

await retrySetup(() => db.transact([
  db.tx.organizations[organizationId].update({ slug: `warehouse-http-${runId}`, name: 'Warehouse HTTP fixture', createdAt: now }),
  db.tx.venues[venueId]
    .update({
      slug: `warehouse-http-${runId}`, name: 'Warehouse HTTP fixture', currency: 'KGS', timeZone: 'Asia/Bishkek',
      venueType: 'restaurant', trackGuests: false, createdAt: now, version: 0,
    })
    .link({ organization: organizationId, ownerUsers: [owner.id] }),
  db.tx.memberships[membershipId]
    .update({ role: 'owner', status: 'active', createdAt: now })
    .link({ organization: organizationId, venue: venueId, user: owner.id }),
  db.tx.warehouses[sourceWarehouseId]
    .update({ venueId, name: 'Source fixture', createdAt: now })
    .link({ venue: venueId }),
  db.tx.warehouses[destinationWarehouseId]
    .update({ venueId, name: 'Destination fixture', createdAt: now })
    .link({ venue: venueId }),
  db.tx.products[productAId]
    .update({ venueId, name: 'Warehouse A', kind: 'ingredient', priceTiyin: 0, costTiyin: 100, unit: 'g', sortOrder: 1, status: 'active', createdAt: now })
    .link({ venue: venueId }),
  db.tx.products[productBId]
    .update({ venueId, name: 'Warehouse B', kind: 'ingredient', priceTiyin: 0, costTiyin: 100, unit: 'g', sortOrder: 2, status: 'active', createdAt: now })
    .link({ venue: venueId }),
]));

const { server } = await import('../server.mjs');
const port = Number(process.env.PORT);
const baseUrl = `http://127.0.0.1:${port}`;

async function waitForServer() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Warehouse HTTP fixture worker did not become ready');
}

async function command(kind, operationId, payload) {
  const response = await fetch(`${baseUrl}/v1/admin/warehouse-commands`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind, operationId, venueId, payload }),
  });
  return { status: response.status, body: await response.json() };
}

async function stockQuantity(warehouseId, productId) {
  const result = await db.query({
    stockItems: { $: { where: { 'warehouse.id': warehouseId, 'product.id': productId }, limit: 1 } },
  });
  const stock = result.stockItems[0];
  return { quantityMilli: stock?.quantityMilli ?? 0, version: stock?.version ?? 0 };
}

async function ledgerQuantity(warehouseId, productId) {
  const result = await db.query({
    inventoryMovements: {
      $: { where: { venueId, 'warehouse.id': warehouseId, 'product.id': productId } },
    },
  });
  return result.inventoryMovements.reduce((sum, movement) => sum + movement.quantityDeltaMilli, 0);
}

async function cleanup() {
  const scoped = await db.query({
    commandClaims: { $: { where: { venueId } } },
    commandOperations: { $: { where: { venueId } } },
    inventoryMovements: { $: { where: { venueId } } },
    inventoryLines: { $: { where: { venueId } } },
    inventorySessions: { $: { where: { venueId } } },
    transferLines: { $: { where: { venueId } } },
    transferDocuments: { $: { where: { venueId } } },
    deliveryLines: { $: { where: { venueId } } },
    deliveryDocuments: { $: { where: { venueId } } },
    stockItems: { $: { where: { venueId } } },
    products: { $: { where: { venueId } } },
  }).catch(() => null);
  if (scoped) {
    const deletes = [
      ...scoped.inventoryMovements.map((row) => db.tx.inventoryMovements[row.id].delete()),
      ...scoped.commandClaims.map((row) => db.tx.commandClaims[row.id].delete()),
      ...scoped.commandOperations.map((row) => db.tx.commandOperations[row.id].delete()),
      ...scoped.inventoryLines.map((row) => db.tx.inventoryLines[row.id].delete()),
      ...scoped.inventorySessions.map((row) => db.tx.inventorySessions[row.id].delete()),
      ...scoped.transferLines.map((row) => db.tx.transferLines[row.id].delete()),
      ...scoped.transferDocuments.map((row) => db.tx.transferDocuments[row.id].delete()),
      ...scoped.deliveryLines.map((row) => db.tx.deliveryLines[row.id].delete()),
      ...scoped.deliveryDocuments.map((row) => db.tx.deliveryDocuments[row.id].delete()),
      ...scoped.stockItems.map((row) => db.tx.stockItems[row.id].delete()),
      ...scoped.products.map((row) => db.tx.products[row.id].delete()),
    ];
    if (deletes.length > 0) await db.transact(deletes).catch(() => {});
  }
  await db.transact([
    db.tx.memberships[membershipId].delete(),
    db.tx.warehouses[sourceWarehouseId].delete(),
    db.tx.warehouses[destinationWarehouseId].delete(),
    db.tx.venues[venueId].delete(),
    db.tx.organizations[organizationId].delete(),
  ]).catch(() => {});
  await db.auth.signOut({ id: owner.id }).catch(() => {});
}

try {
  await waitForServer();

  const createIngredientOperationId = `create-ingredient-${runId}`;
  const createdIngredient = await command('create-ingredient', createIngredientOperationId, {
    name: 'Created ingredient',
    unit: 'g',
    initialQuantityMilli: 2_500,
    warehouseIds: [sourceWarehouseId, destinationWarehouseId],
  });
  assert.equal(createdIngredient.status, 200, JSON.stringify(createdIngredient.body));
  const ingredientId = createdIngredient.body.productId;
  const ingredientReplay = await command('create-ingredient', createIngredientOperationId, {
    warehouseIds: [sourceWarehouseId, destinationWarehouseId],
    initialQuantityMilli: 2_500,
    unit: 'g',
    name: 'Created ingredient',
  });
  assert.deepEqual(ingredientReplay, createdIngredient);
  assert.equal((await stockQuantity(sourceWarehouseId, ingredientId)).quantityMilli, 2_500);
  assert.equal((await stockQuantity(destinationWarehouseId, ingredientId)).quantityMilli, 0);

  const updatedIngredient = await command('update-ingredient', `update-ingredient-${runId}`, {
    productId: ingredientId,
    name: 'Updated ingredient',
    unit: 'kg',
    warehouseIds: [destinationWarehouseId],
  });
  assert.equal(updatedIngredient.status, 200, JSON.stringify(updatedIngredient.body));
  const ingredientState = await db.query({
    products: { $: { where: { id: ingredientId }, limit: 1 }, warehouses: {} },
    stockItems: { $: { where: { 'product.id': ingredientId } }, warehouse: {} },
  });
  assert.equal(ingredientState.products[0].name, 'Updated ingredient');
  assert.deepEqual(ingredientState.products[0].warehouses.map((warehouse) => warehouse.id), [destinationWarehouseId]);
  assert.equal(ingredientState.stockItems.find((stock) => stock.warehouse.id === destinationWarehouseId)?.unit, 'kg');
  assert.equal(ingredientState.stockItems.find((stock) => stock.warehouse.id === sourceWarehouseId)?.quantityMilli, 2_500);

  const createdDelivery = await command('create-delivery', `create-delivery-${runId}`, {
    warehouseId: sourceWarehouseId, supplier: 'Fixture supplier', deliveryDate: now,
    source: 'manual', lines: [
      { productId: productAId, name: 'Warehouse A', quantityMilli: 10_000, unit: 'g', priceTiyin: 100 },
      { productId: productBId, name: 'Warehouse B', quantityMilli: 5_000, unit: 'g', priceTiyin: 100 },
    ],
  });
  assert.equal(createdDelivery.status, 200, JSON.stringify(createdDelivery.body));
  const deliveryId = createdDelivery.body.deliveryId;

  const updatedDelivery = await command('update-delivery', `update-delivery-${runId}`, {
    documentId: deliveryId,
    patch: { lines: [{ productId: productAId, name: 'Warehouse A', quantityMilli: 10_000, unit: 'g', priceTiyin: 100 }] },
  });
  assert.equal(updatedDelivery.status, 200, JSON.stringify(updatedDelivery.body));
  const deliveryAfterReplacement = await db.query({
    deliveryDocuments: { $: { where: { id: deliveryId }, limit: 1 }, lines: {} },
  });
  assert.equal(deliveryAfterReplacement.deliveryDocuments[0]?.lines.length, 1, 'removed delivery lines must be deleted');

  const receiveRace = await Promise.all([
    command('receive-delivery', `receive-a-${runId}`, { documentId: deliveryId, expectedVersion: 1 }),
    command('receive-delivery', `receive-b-${runId}`, { documentId: deliveryId, expectedVersion: 1 }),
  ]);
  assert.equal(receiveRace.filter((result) => result.status === 200).length, 1);
  assert.equal(receiveRace.filter((result) => result.status === 409).length, 1);
  assert.equal((await stockQuantity(sourceWarehouseId, productAId)).quantityMilli, 10_000);

  const correctedDelivery = await command('create-delivery', `corrected-delivery-${runId}`, {
    warehouseId: sourceWarehouseId, supplier: 'Corrected supplier', deliveryDate: now,
    source: 'manual', lines: [
      { productId: productBId, name: 'Warehouse B', quantityMilli: 5_000, unit: 'g', priceTiyin: 200 },
    ],
  });
  assert.equal(correctedDelivery.status, 200, JSON.stringify(correctedDelivery.body));
  const correctedReceive = await command('receive-delivery', `corrected-receive-${runId}`, {
    documentId: correctedDelivery.body.deliveryId,
    expectedVersion: 0,
    receivedLines: [{
      productId: productBId,
      receivedQuantityMilli: 3_000,
      receivedPriceTiyin: 200,
    }],
  });
  assert.equal(correctedReceive.status, 200, JSON.stringify(correctedReceive.body));
  const correctedState = await db.query({
    deliveryDocuments: {
      $: { where: { id: correctedDelivery.body.deliveryId }, limit: 1 },
      lines: {},
    },
  });
  assert.equal(correctedState.deliveryDocuments[0].amountTiyin, 600);
  assert.equal(correctedState.deliveryDocuments[0].lines[0].orderedQuantityMilli, 5_000);
  assert.equal(correctedState.deliveryDocuments[0].lines[0].receivedQuantityMilli, 3_000);
  assert.equal((await stockQuantity(sourceWarehouseId, productBId)).quantityMilli, 3_000);

  const correctedTransfer = await command('create-transfer', `corrected-transfer-${runId}`, {
    fromWarehouseId: sourceWarehouseId,
    toWarehouseId: destinationWarehouseId,
    transferDate: now,
    lines: [{ productId: productBId, name: 'Warehouse B', quantityMilli: 2_000, unit: 'g' }],
  });
  assert.equal(correctedTransfer.status, 200, JSON.stringify(correctedTransfer.body));
  const correctedTransferPost = await command('post-transfer', `corrected-transfer-post-${runId}`, {
    documentId: correctedTransfer.body.transferId,
    expectedVersion: 0,
    lineQuantities: [{ productId: productBId, quantityMilli: 1_000 }],
  });
  assert.equal(correctedTransferPost.status, 200, JSON.stringify(correctedTransferPost.body));
  assert.equal((await stockQuantity(sourceWarehouseId, productBId)).quantityMilli, 2_000);
  assert.equal((await stockQuantity(destinationWarehouseId, productBId)).quantityMilli, 1_000);

  const correctedWriteOff = await command('create-write-off', `corrected-write-off-${runId}`, {
    warehouseId: sourceWarehouseId,
    reasonSummary: 'Correction fixture',
    writeOffDate: now,
    createdByName: 'Fixture admin',
    lines: [{
      productId: productBId,
      name: 'Warehouse B',
      quantityMilli: 1_500,
      unit: 'g',
      reason: 'Fixture',
    }],
  });
  assert.equal(correctedWriteOff.status, 200, JSON.stringify(correctedWriteOff.body));
  const correctedWriteOffPost = await command('post-write-off', `corrected-write-off-post-${runId}`, {
    documentId: correctedWriteOff.body.writeOffId,
    expectedVersion: 0,
    lineQuantities: [{ productId: productBId, quantityMilli: 500 }],
  });
  assert.equal(correctedWriteOffPost.status, 200, JSON.stringify(correctedWriteOffPost.body));
  assert.equal((await stockQuantity(sourceWarehouseId, productBId)).quantityMilli, 1_500);

  const createdTransfer = await command('create-transfer', `create-transfer-${runId}`, {
    fromWarehouseId: sourceWarehouseId, toWarehouseId: destinationWarehouseId, transferDate: now,
    lines: [{ productId: productAId, name: 'Warehouse A', quantityMilli: 4_000, unit: 'g' }],
  });
  assert.equal(createdTransfer.status, 200, JSON.stringify(createdTransfer.body));
  const postedTransfer = await command('post-transfer', `post-transfer-${runId}`, {
    documentId: createdTransfer.body.transferId,
    expectedVersion: 0,
  });
  assert.equal(postedTransfer.status, 200, JSON.stringify(postedTransfer.body));
  assert.equal((await stockQuantity(sourceWarehouseId, productAId)).quantityMilli, 6_000);
  assert.equal((await stockQuantity(destinationWarehouseId, productAId)).quantityMilli, 4_000);

  const deliveryCommands = await Promise.all(['a', 'b'].map(async (suffix) => {
    const created = await command('create-delivery', `stock-race-create-${suffix}-${runId}`, {
      warehouseId: sourceWarehouseId, supplier: 'Race supplier', deliveryDate: now, source: 'manual',
      lines: [{ productId: productAId, name: 'Warehouse A', quantityMilli: 1_000, unit: 'g', priceTiyin: 100 }],
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    return { operationId: `stock-race-receive-${suffix}-${runId}`, documentId: created.body.deliveryId };
  }));
  const stockRace = await Promise.all(deliveryCommands.map(({ operationId, documentId }) =>
    command('receive-delivery', operationId, { documentId, expectedVersion: 0 })));
  assert.equal(stockRace.filter((result) => result.status === 200).length, 1);
  assert.equal(stockRace.filter((result) => result.status === 409).length, 1);
  assert.equal((await stockQuantity(sourceWarehouseId, productAId)).quantityMilli, 7_000);
  const loserIndex = stockRace.findIndex((result) => result.status === 409);
  const conflictRetry = await command(
    'receive-delivery', deliveryCommands[loserIndex].operationId,
    { documentId: deliveryCommands[loserIndex].documentId, expectedVersion: 0 },
  );
  assert.equal(conflictRetry.status, 200, JSON.stringify(conflictRetry.body));
  assert.equal((await stockQuantity(sourceWarehouseId, productAId)).quantityMilli, 8_000);

  const createdInventory = await command('create-inventory', `create-inventory-${runId}`, {
    warehouseId: sourceWarehouseId, inventoryType: 'full', conductedAt: now,
  });
  assert.equal(createdInventory.status, 200, JSON.stringify(createdInventory.body));
  const inventoryId = createdInventory.body.sessionId;
  const savedInventory = await command('save-inventory-lines', `save-inventory-${runId}`, {
    sessionId: inventoryId,
    lines: [{ productId: productAId, name: 'Warehouse A', unit: 'g', actualMilli: 7_500, unitPriceTiyin: 100 }],
  });
  assert.equal(savedInventory.status, 200, JSON.stringify(savedInventory.body));

  const staleDelivery = await command('create-delivery', `stale-create-${runId}`, {
    warehouseId: sourceWarehouseId, supplier: 'Stale supplier', deliveryDate: now, source: 'manual',
    lines: [{ productId: productAId, name: 'Warehouse A', quantityMilli: 1_000, unit: 'g', priceTiyin: 100 }],
  });
  assert.equal(staleDelivery.status, 200, JSON.stringify(staleDelivery.body));
  const staleReceive = await command('receive-delivery', `stale-receive-${runId}`, {
    documentId: staleDelivery.body.deliveryId,
    expectedVersion: 0,
  });
  assert.equal(staleReceive.status, 200, JSON.stringify(staleReceive.body));
  const stalePost = await command('post-inventory', `stale-post-${runId}`, { sessionId: inventoryId });
  assert.equal(stalePost.status, 409, JSON.stringify(stalePost.body));
  assert.equal(stalePost.body.code, 'stale_inventory_snapshot');
  assert.equal((await stockQuantity(sourceWarehouseId, productAId)).quantityMilli, 9_000);
  assert.equal(await ledgerQuantity(sourceWarehouseId, productAId), 9_000);
  assert.equal(await ledgerQuantity(destinationWarehouseId, productAId), 4_000);

  console.log('Verified corrected receipt quantities, atomic line replacement, receive conflicts, retry, transfer balances, and stale inventory rejection.');
} finally {
  if (server.listening) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  await cleanup();
}
