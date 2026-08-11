import { deterministicId } from '@lumo/data';
import { replayInstantCommand, runInstantCommand } from './instant-command-runner.mjs';

function commandError(message, code = 'invalid_request', statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function nonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw commandError(`${name} is required`);
  return value.trim();
}

function safeInteger(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw commandError(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

function linked(value) {
  if (Array.isArray(value)) return value[0];
  return value && typeof value === 'object' ? value : undefined;
}

function versionOf(entity, name) {
  if (!Number.isSafeInteger(entity?.version) || entity.version < 0) {
    throw commandError(`${name} is missing a valid version`, 'invalid_resource_version', 409);
  }
  return entity.version;
}

function claim(resourceType, resourceId, expectedVersion) {
  return { resourceType, resourceId, expectedVersion };
}

function uniqueProductLines(lines, normalize) {
  if (!Array.isArray(lines)) throw commandError('lines must be an array');
  const normalized = lines.map(normalize);
  const productIds = normalized.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw commandError('A document cannot contain duplicate products', 'duplicate_product', 400);
  }
  return normalized;
}

function normalizeBaseLine(line, index) {
  return {
    productId: nonEmptyString(line?.productId, `lines[${index}].productId`),
    name: nonEmptyString(line?.name, `lines[${index}].name`),
    unit: nonEmptyString(line?.unit, `lines[${index}].unit`),
    quantityMilli: safeInteger(line?.quantityMilli, `lines[${index}].quantityMilli`, 1),
  };
}

function normalizeDeliveryLines(lines) {
  return uniqueProductLines(lines, (line, index) => ({
    ...normalizeBaseLine(line, index),
    priceTiyin: safeInteger(line?.priceTiyin, `lines[${index}].priceTiyin`),
  }));
}

function normalizeWriteOffLines(lines) {
  return uniqueProductLines(lines, (line, index) => ({
    ...normalizeBaseLine(line, index),
    reason: nonEmptyString(line?.reason, `lines[${index}].reason`),
  }));
}

function normalizeTransferLines(lines) {
  return uniqueProductLines(lines, normalizeBaseLine);
}

function normalizeInventoryLines(lines) {
  return uniqueProductLines(lines, (line, index) => ({
    productId: nonEmptyString(line?.productId, `lines[${index}].productId`),
    name: nonEmptyString(line?.name, `lines[${index}].name`),
    unit: nonEmptyString(line?.unit, `lines[${index}].unit`),
    actualMilli: safeInteger(line?.actualMilli, `lines[${index}].actualMilli`),
    unitPriceTiyin: safeInteger(line?.unitPriceTiyin, `lines[${index}].unitPriceTiyin`),
  }));
}

async function entitiesByIds(db, namespace, ids, nested = {}) {
  if (ids.length === 0) return [];
  const result = await db.query({
    [namespace]: { $: { where: { id: { $in: ids } }, limit: ids.length }, ...nested },
  });
  return result[namespace];
}

async function entityById(db, namespace, id, nested = {}) {
  const entities = await entitiesByIds(db, namespace, [id], nested);
  return entities[0];
}

function requireVenueEntity(entity, venueId, name) {
  if (!entity || entity.venueId !== venueId) throw commandError(`${name} was not found`, 'not_found', 404);
  return entity;
}

async function validateWarehouse(db, warehouseId, venueId, name = 'Warehouse') {
  const warehouse = await entityById(db, 'warehouses', warehouseId);
  return requireVenueEntity(warehouse, venueId, name);
}

async function validateProducts(db, productIds, venueId) {
  const products = await entitiesByIds(db, 'products', productIds);
  if (products.length !== productIds.length || products.some((product) => product.venueId !== venueId)) {
    throw commandError('A product was not found in this venue', 'not_found', 404);
  }
}

function stableLineId(kind, documentId, productId) {
  return deterministicId(`${kind}-line-v2`, documentId, productId);
}

function stockItemId(warehouseId, productId) {
  return deterministicId('stock-item', warehouseId, productId);
}

async function loadStocks(db, pairs) {
  const ids = pairs.map(({ warehouseId, productId }) => stockItemId(warehouseId, productId));
  const rows = await entitiesByIds(db, 'stockItems', [...new Set(ids)], { warehouse: {}, product: {} });
  return new Map(rows.map((row) => [row.id, row]));
}

function stockState(stocks, warehouseId, productId) {
  const id = stockItemId(warehouseId, productId);
  const row = stocks.get(id);
  return {
    id,
    quantityMilli: row ? safeInteger(row.quantityMilli, 'stock quantity') : 0,
    version: row ? versionOf(row, 'Stock item') : 0,
  };
}

function stockStep(db, venueId, warehouseId, productId, unit, quantityMilli, version, now) {
  return db.tx.stockItems[stockItemId(warehouseId, productId)]
    .update({ venueId, quantityMilli, unit, updatedAt: now, version })
    .link({ warehouse: warehouseId, product: productId });
}

function stockMutationSteps(
  db,
  { venueId, operationId, warehouseId, productId, unit, quantityMilli, version, delta, reason, now, documentId },
) {
  const steps = [stockStep(db, venueId, warehouseId, productId, unit, quantityMilli, version, now)];
  if (delta === 0) return steps;
  const movementId = deterministicId(
    'warehouse-stock-movement',
    `${venueId}:${operationId}`,
    warehouseId,
    productId,
    reason,
  );
  steps.push(
    db.tx.inventoryMovements[movementId]
      .update({
        venueId,
        operationId: movementId,
        quantityDeltaMilli: delta,
        unit,
        reason,
        lineIdempotencyKey: movementId,
        metadata: { commandOperationId: operationId, documentId },
        occurredAt: now,
        createdAt: now,
      })
      .link({ venue: venueId, warehouse: warehouseId, product: productId }),
  );
  return steps;
}

function documentLineProductId(line) {
  const product = linked(line.product);
  if (!product?.id) throw commandError('Document line is missing its product', 'invalid_document', 409);
  return product.id;
}

function documentWarehouseId(document, relation = 'warehouse') {
  const warehouse = linked(document[relation]);
  if (!warehouse?.id) throw commandError('Document is missing its warehouse', 'invalid_document', 409);
  return warehouse.id;
}

function ensureDocumentStatus(document, statuses, name) {
  if (!statuses.includes(document.status)) {
    throw commandError(`${name} cannot transition from status ${document.status}`, 'invalid_state_transition', 409);
  }
}

function lineDeletionSteps(db, namespace, existingLines, desiredIds) {
  return existingLines
    .filter((line) => !desiredIds.has(line.id))
    .map((line) => db.tx[namespace][line.id].delete());
}

function commandContext(db, adminUserId, operationId, venueId, kind, payload, build) {
  return runInstantCommand({ db, adminUserId, operationId, venueId, kind, payload }, build);
}

async function createDelivery(db, adminUserId, operationId, venueId, payload) {
  const warehouseId = nonEmptyString(payload.warehouseId, 'warehouseId');
  const lines = normalizeDeliveryLines(payload.lines);
  if (lines.length === 0) throw commandError('Delivery requires at least one line');
  await Promise.all([validateWarehouse(db, warehouseId, venueId), validateProducts(db, lines.map((line) => line.productId), venueId)]);
  const documentId = deterministicId('delivery-document', `${venueId}:${operationId}`);
  const now = new Date().toISOString();
  const amountTiyin = lines.reduce((sum, line) => sum + Math.round((line.quantityMilli * line.priceTiyin) / 1000), 0);
  return commandContext(db, adminUserId, operationId, venueId, 'create-delivery', payload, async () => ({
    steps: [
      db.tx.deliveryDocuments[documentId]
        .update({
          venueId, operationId, supplier: nonEmptyString(payload.supplier, 'supplier'),
          deliveryDate: nonEmptyString(payload.deliveryDate, 'deliveryDate'), amountTiyin,
          status: 'draft', source: nonEmptyString(payload.source ?? 'manual', 'source'),
          comment: typeof payload.comment === 'string' ? payload.comment : '', createdAt: now, version: 0,
        })
        .link({ venue: venueId, warehouse: warehouseId }),
      ...lines.map((line) => db.tx.deliveryLines[stableLineId('delivery', documentId, line.productId)]
        .update({ venueId, name: line.name, quantityMilli: line.quantityMilli, unit: line.unit, priceTiyin: line.priceTiyin })
        .link({ document: documentId, product: line.productId })),
    ],
    result: { deliveryId: documentId },
  }));
}

async function updateDelivery(db, adminUserId, operationId, venueId, payload) {
  const documentId = nonEmptyString(payload.documentId, 'documentId');
  const document = requireVenueEntity(await entityById(db, 'deliveryDocuments', documentId, { lines: { product: {} } }), venueId, 'Delivery');
  ensureDocumentStatus(document, ['draft'], 'Delivery');
  const patch = payload.patch ?? {};
  const fields = { version: versionOf(document, 'Delivery') + 1 };
  if (patch.supplier !== undefined) fields.supplier = nonEmptyString(patch.supplier, 'supplier');
  if (patch.deliveryDate !== undefined) fields.deliveryDate = nonEmptyString(patch.deliveryDate, 'deliveryDate');
  if (patch.comment !== undefined) fields.comment = String(patch.comment);
  let lineSteps = [];
  if (patch.lines !== undefined) {
    const lines = normalizeDeliveryLines(patch.lines);
    if (lines.length === 0) throw commandError('Delivery requires at least one line');
    await validateProducts(db, lines.map((line) => line.productId), venueId);
    fields.amountTiyin = lines.reduce((sum, line) => sum + Math.round((line.quantityMilli * line.priceTiyin) / 1000), 0);
    const desiredIds = new Set(lines.map((line) => stableLineId('delivery', documentId, line.productId)));
    lineSteps = [
      ...lineDeletionSteps(db, 'deliveryLines', document.lines, desiredIds),
      ...lines.map((line) => db.tx.deliveryLines[stableLineId('delivery', documentId, line.productId)]
        .update({ venueId, name: line.name, quantityMilli: line.quantityMilli, unit: line.unit, priceTiyin: line.priceTiyin })
        .link({ document: documentId, product: line.productId })),
    ];
  }
  return commandContext(db, adminUserId, operationId, venueId, 'update-delivery', payload, async () => ({
    claims: [claim('delivery-document', documentId, document.version)],
    steps: [db.tx.deliveryDocuments[documentId].update(fields), ...lineSteps],
    result: { deliveryId: documentId },
  }));
}

async function transitionDelivery(db, adminUserId, operationId, venueId, payload, action) {
  const documentId = nonEmptyString(payload.documentId, 'documentId');
  const document = requireVenueEntity(await entityById(db, 'deliveryDocuments', documentId, { warehouse: {}, lines: { product: {} } }), venueId, 'Delivery');
  const receiving = action === 'receive';
  ensureDocumentStatus(document, receiving ? ['draft', 'in_transit'] : ['draft', 'in_transit', 'received'], 'Delivery');
  const warehouseId = documentWarehouseId(document);
  const lines = document.lines.map((line) => ({ ...line, productId: documentLineProductId(line) }));
  const changes = receiving || document.status === 'received'
    ? lines.map((line) => ({ warehouseId, productId: line.productId, unit: line.unit, delta: (receiving ? 1 : -1) * line.quantityMilli }))
    : [];
  const stocks = await loadStocks(db, changes);
  const now = new Date().toISOString();
  const stockClaims = [];
  const stockSteps = changes.flatMap((change) => {
    const state = stockState(stocks, change.warehouseId, change.productId);
    const next = state.quantityMilli + change.delta;
    if (next < 0) throw commandError('Cancelling this delivery would make stock negative', 'insufficient_stock', 409);
    stockClaims.push(claim('stock-item', state.id, state.version));
    return stockMutationSteps(db, {
      venueId, operationId, ...change, quantityMilli: next, version: state.version + 1,
      reason: `${action}_delivery`, now, documentId,
    });
  });
  return commandContext(db, adminUserId, operationId, venueId, `${action}-delivery`, payload, async () => ({
    claims: [claim('delivery-document', documentId, document.version), ...stockClaims],
    steps: [db.tx.deliveryDocuments[documentId].update({ status: receiving ? 'received' : 'cancelled', version: document.version + 1 }), ...stockSteps],
    result: { deliveryId: documentId, status: receiving ? 'received' : 'cancelled' },
  }));
}

async function createWriteOff(db, adminUserId, operationId, venueId, payload) {
  const warehouseId = nonEmptyString(payload.warehouseId, 'warehouseId');
  const lines = normalizeWriteOffLines(payload.lines);
  if (lines.length === 0) throw commandError('Write-off requires at least one line');
  await Promise.all([validateWarehouse(db, warehouseId, venueId), validateProducts(db, lines.map((line) => line.productId), venueId)]);
  const documentId = deterministicId('write-off-document', `${venueId}:${operationId}`);
  const now = new Date().toISOString();
  return commandContext(db, adminUserId, operationId, venueId, 'create-write-off', payload, async () => ({
    steps: [
      db.tx.writeOffDocuments[documentId]
        .update({
          venueId, operationId, reasonSummary: nonEmptyString(payload.reasonSummary, 'reasonSummary'),
          writeOffDate: nonEmptyString(payload.writeOffDate, 'writeOffDate'), status: 'draft',
          createdByName: nonEmptyString(payload.createdByName, 'createdByName'),
          comment: typeof payload.comment === 'string' ? payload.comment : '', createdAt: now, version: 0,
        })
        .link({ venue: venueId, warehouse: warehouseId }),
      ...lines.map((line) => db.tx.writeOffLines[stableLineId('write-off', documentId, line.productId)]
        .update({ venueId, name: line.name, quantityMilli: line.quantityMilli, unit: line.unit, reason: line.reason })
        .link({ document: documentId, product: line.productId })),
    ],
    result: { writeOffId: documentId },
  }));
}

async function updateWriteOff(db, adminUserId, operationId, venueId, payload) {
  const documentId = nonEmptyString(payload.documentId, 'documentId');
  const document = requireVenueEntity(await entityById(db, 'writeOffDocuments', documentId, { lines: { product: {} } }), venueId, 'Write-off');
  ensureDocumentStatus(document, ['draft'], 'Write-off');
  const patch = payload.patch ?? {};
  const fields = { version: versionOf(document, 'Write-off') + 1 };
  if (patch.reasonSummary !== undefined) fields.reasonSummary = nonEmptyString(patch.reasonSummary, 'reasonSummary');
  if (patch.writeOffDate !== undefined) fields.writeOffDate = nonEmptyString(patch.writeOffDate, 'writeOffDate');
  if (patch.comment !== undefined) fields.comment = String(patch.comment);
  let lineSteps = [];
  if (patch.lines !== undefined) {
    const lines = normalizeWriteOffLines(patch.lines);
    if (lines.length === 0) throw commandError('Write-off requires at least one line');
    await validateProducts(db, lines.map((line) => line.productId), venueId);
    const desiredIds = new Set(lines.map((line) => stableLineId('write-off', documentId, line.productId)));
    lineSteps = [
      ...lineDeletionSteps(db, 'writeOffLines', document.lines, desiredIds),
      ...lines.map((line) => db.tx.writeOffLines[stableLineId('write-off', documentId, line.productId)]
        .update({ venueId, name: line.name, quantityMilli: line.quantityMilli, unit: line.unit, reason: line.reason })
        .link({ document: documentId, product: line.productId })),
    ];
  }
  return commandContext(db, adminUserId, operationId, venueId, 'update-write-off', payload, async () => ({
    claims: [claim('write-off-document', documentId, document.version)],
    steps: [db.tx.writeOffDocuments[documentId].update(fields), ...lineSteps],
    result: { writeOffId: documentId },
  }));
}

async function transitionWriteOff(db, adminUserId, operationId, venueId, payload, action) {
  const documentId = nonEmptyString(payload.documentId, 'documentId');
  const document = requireVenueEntity(await entityById(db, 'writeOffDocuments', documentId, { warehouse: {}, lines: { product: {} } }), venueId, 'Write-off');
  const posting = action === 'post';
  ensureDocumentStatus(document, posting ? ['draft'] : ['draft', 'posted'], 'Write-off');
  const warehouseId = documentWarehouseId(document);
  const lines = document.lines.map((line) => ({ ...line, productId: documentLineProductId(line) }));
  const changes = posting || document.status === 'posted'
    ? lines.map((line) => ({ warehouseId, productId: line.productId, unit: line.unit, delta: (posting ? -1 : 1) * line.quantityMilli }))
    : [];
  const stocks = await loadStocks(db, changes);
  const now = new Date().toISOString();
  const stockClaims = [];
  const stockSteps = changes.flatMap((change) => {
    const state = stockState(stocks, change.warehouseId, change.productId);
    const next = state.quantityMilli + change.delta;
    if (next < 0) throw commandError('Insufficient stock for this write-off', 'insufficient_stock', 409);
    stockClaims.push(claim('stock-item', state.id, state.version));
    return stockMutationSteps(db, {
      venueId, operationId, ...change, quantityMilli: next, version: state.version + 1,
      reason: `${action}_write_off`, now, documentId,
    });
  });
  return commandContext(db, adminUserId, operationId, venueId, `${action}-write-off`, payload, async () => ({
    claims: [claim('write-off-document', documentId, document.version), ...stockClaims],
    steps: [db.tx.writeOffDocuments[documentId].update({ status: posting ? 'posted' : 'cancelled', version: document.version + 1 }), ...stockSteps],
    result: { writeOffId: documentId, status: posting ? 'posted' : 'cancelled' },
  }));
}

async function createTransfer(db, adminUserId, operationId, venueId, payload) {
  const fromWarehouseId = nonEmptyString(payload.fromWarehouseId, 'fromWarehouseId');
  const toWarehouseId = nonEmptyString(payload.toWarehouseId, 'toWarehouseId');
  if (fromWarehouseId === toWarehouseId) throw commandError('Transfer warehouses must differ');
  const lines = normalizeTransferLines(payload.lines);
  if (lines.length === 0) throw commandError('Transfer requires at least one line');
  await Promise.all([
    validateWarehouse(db, fromWarehouseId, venueId, 'Source warehouse'),
    validateWarehouse(db, toWarehouseId, venueId, 'Destination warehouse'),
    validateProducts(db, lines.map((line) => line.productId), venueId),
  ]);
  const documentId = deterministicId('transfer-document', `${venueId}:${operationId}`);
  const now = new Date().toISOString();
  return commandContext(db, adminUserId, operationId, venueId, 'create-transfer', payload, async () => ({
    steps: [
      db.tx.transferDocuments[documentId]
        .update({
          venueId, operationId, transferDate: nonEmptyString(payload.transferDate, 'transferDate'),
          status: 'draft', comment: typeof payload.comment === 'string' ? payload.comment : '', createdAt: now, version: 0,
        })
        .link({ venue: venueId, fromWarehouse: fromWarehouseId, toWarehouse: toWarehouseId }),
      ...lines.map((line) => db.tx.transferLines[stableLineId('transfer', documentId, line.productId)]
        .update({ venueId, name: line.name, quantityMilli: line.quantityMilli, unit: line.unit })
        .link({ document: documentId, product: line.productId })),
    ],
    result: { transferId: documentId },
  }));
}

async function updateTransfer(db, adminUserId, operationId, venueId, payload) {
  const documentId = nonEmptyString(payload.documentId, 'documentId');
  const document = requireVenueEntity(await entityById(db, 'transferDocuments', documentId, { lines: { product: {} } }), venueId, 'Transfer');
  ensureDocumentStatus(document, ['draft'], 'Transfer');
  const patch = payload.patch ?? {};
  const fields = { version: versionOf(document, 'Transfer') + 1 };
  if (patch.transferDate !== undefined) fields.transferDate = nonEmptyString(patch.transferDate, 'transferDate');
  if (patch.comment !== undefined) fields.comment = String(patch.comment);
  let lineSteps = [];
  if (patch.lines !== undefined) {
    const lines = normalizeTransferLines(patch.lines);
    if (lines.length === 0) throw commandError('Transfer requires at least one line');
    await validateProducts(db, lines.map((line) => line.productId), venueId);
    const desiredIds = new Set(lines.map((line) => stableLineId('transfer', documentId, line.productId)));
    lineSteps = [
      ...lineDeletionSteps(db, 'transferLines', document.lines, desiredIds),
      ...lines.map((line) => db.tx.transferLines[stableLineId('transfer', documentId, line.productId)]
        .update({ venueId, name: line.name, quantityMilli: line.quantityMilli, unit: line.unit })
        .link({ document: documentId, product: line.productId })),
    ];
  }
  return commandContext(db, adminUserId, operationId, venueId, 'update-transfer', payload, async () => ({
    claims: [claim('transfer-document', documentId, document.version)],
    steps: [db.tx.transferDocuments[documentId].update(fields), ...lineSteps],
    result: { transferId: documentId },
  }));
}

async function transitionTransfer(db, adminUserId, operationId, venueId, payload, action) {
  const documentId = nonEmptyString(payload.documentId, 'documentId');
  const document = requireVenueEntity(await entityById(db, 'transferDocuments', documentId, { fromWarehouse: {}, toWarehouse: {}, lines: { product: {} } }), venueId, 'Transfer');
  const posting = action === 'post';
  ensureDocumentStatus(document, posting ? ['draft'] : ['draft', 'posted'], 'Transfer');
  const fromWarehouseId = documentWarehouseId(document, 'fromWarehouse');
  const toWarehouseId = documentWarehouseId(document, 'toWarehouse');
  const lines = document.lines.map((line) => ({ ...line, productId: documentLineProductId(line) }));
  const changes = posting || document.status === 'posted'
    ? lines.flatMap((line) => [
      { warehouseId: fromWarehouseId, productId: line.productId, unit: line.unit, delta: (posting ? -1 : 1) * line.quantityMilli },
      { warehouseId: toWarehouseId, productId: line.productId, unit: line.unit, delta: (posting ? 1 : -1) * line.quantityMilli },
    ])
    : [];
  const stocks = await loadStocks(db, changes);
  const now = new Date().toISOString();
  const stockClaims = [];
  const stockSteps = changes.flatMap((change) => {
    const state = stockState(stocks, change.warehouseId, change.productId);
    const next = state.quantityMilli + change.delta;
    if (next < 0) throw commandError('Insufficient stock for this transfer transition', 'insufficient_stock', 409);
    stockClaims.push(claim('stock-item', state.id, state.version));
    return stockMutationSteps(db, {
      venueId, operationId, ...change, quantityMilli: next, version: state.version + 1,
      reason: `${action}_transfer`, now, documentId,
    });
  });
  return commandContext(db, adminUserId, operationId, venueId, `${action}-transfer`, payload, async () => ({
    claims: [claim('transfer-document', documentId, document.version), ...stockClaims],
    steps: [db.tx.transferDocuments[documentId].update({ status: posting ? 'posted' : 'cancelled', version: document.version + 1 }), ...stockSteps],
    result: { transferId: documentId, status: posting ? 'posted' : 'cancelled' },
  }));
}

async function createInventory(db, adminUserId, operationId, venueId, payload) {
  const warehouseId = nonEmptyString(payload.warehouseId, 'warehouseId');
  await validateWarehouse(db, warehouseId, venueId);
  const sessionId = deterministicId('inventory-session', `${venueId}:${operationId}`);
  const now = new Date().toISOString();
  return commandContext(db, adminUserId, operationId, venueId, 'create-inventory', payload, async () => ({
    steps: [db.tx.inventorySessions[sessionId]
      .update({
        venueId, operationId, inventoryType: nonEmptyString(payload.inventoryType, 'inventoryType'),
        conductedAt: nonEmptyString(payload.conductedAt, 'conductedAt'), status: 'draft',
        resultDeltaTiyin: 0, createdAt: now, version: 0,
      })
      .link({ venue: venueId, warehouse: warehouseId })],
    result: { sessionId },
  }));
}

async function saveInventory(db, adminUserId, operationId, venueId, payload) {
  const sessionId = nonEmptyString(payload.sessionId, 'sessionId');
  const session = requireVenueEntity(await entityById(db, 'inventorySessions', sessionId, { warehouse: {}, lines: { product: {} } }), venueId, 'Inventory session');
  ensureDocumentStatus(session, ['draft'], 'Inventory session');
  const warehouseId = documentWarehouseId(session);
  const lines = normalizeInventoryLines(payload.lines);
  await validateProducts(db, lines.map((line) => line.productId), venueId);
  const pairs = lines.map((line) => ({ warehouseId, productId: line.productId }));
  const stocks = await loadStocks(db, pairs);
  const now = new Date().toISOString();
  const stockClaims = [];
  const stockSteps = [];
  const desiredIds = new Set(lines.map((line) => stableLineId('inventory', sessionId, line.productId)));
  const lineSteps = lines.map((line) => {
    const state = stockState(stocks, warehouseId, line.productId);
    stockClaims.push(claim('stock-item', state.id, state.version));
    stockSteps.push(stockStep(db, venueId, warehouseId, line.productId, line.unit, state.quantityMilli, state.version + 1, now));
    return db.tx.inventoryLines[stableLineId('inventory', sessionId, line.productId)]
      .update({
        venueId, name: line.name, unit: line.unit, theoreticalMilli: state.quantityMilli,
        actualMilli: line.actualMilli, unitPriceTiyin: line.unitPriceTiyin,
        theoreticalStockVersion: state.version + 1,
      })
      .link({ session: sessionId, product: line.productId });
  });
  return commandContext(db, adminUserId, operationId, venueId, 'save-inventory-lines', payload, async () => ({
    claims: [claim('inventory-session', sessionId, session.version), ...stockClaims],
    steps: [
      db.tx.inventorySessions[sessionId].update({ version: session.version + 1 }),
      ...stockSteps,
      ...lineDeletionSteps(db, 'inventoryLines', session.lines, desiredIds),
      ...lineSteps,
    ],
    result: { sessionId, lineCount: lines.length },
  }));
}

async function updateInventory(db, adminUserId, operationId, venueId, payload) {
  const sessionId = nonEmptyString(payload.sessionId, 'sessionId');
  const session = requireVenueEntity(await entityById(db, 'inventorySessions', sessionId), venueId, 'Inventory session');
  ensureDocumentStatus(session, ['draft'], 'Inventory session');
  const patch = payload.patch ?? {};
  const fields = { version: versionOf(session, 'Inventory session') + 1 };
  if (patch.inventoryType !== undefined) fields.inventoryType = nonEmptyString(patch.inventoryType, 'inventoryType');
  if (patch.conductedAt !== undefined) fields.conductedAt = nonEmptyString(patch.conductedAt, 'conductedAt');
  return commandContext(db, adminUserId, operationId, venueId, 'update-inventory', payload, async () => ({
    claims: [claim('inventory-session', sessionId, session.version)],
    steps: [db.tx.inventorySessions[sessionId].update(fields)],
    result: { sessionId },
  }));
}

async function postInventory(db, adminUserId, operationId, venueId, payload) {
  const sessionId = nonEmptyString(payload.sessionId, 'sessionId');
  const session = requireVenueEntity(await entityById(db, 'inventorySessions', sessionId, { warehouse: {}, lines: { product: {} } }), venueId, 'Inventory session');
  ensureDocumentStatus(session, ['draft'], 'Inventory session');
  if (session.lines.length === 0) throw commandError('Inventory session has no saved lines', 'invalid_state_transition', 409);
  const warehouseId = documentWarehouseId(session);
  const lines = session.lines.map((line) => ({ ...line, productId: documentLineProductId(line) }));
  const pairs = lines.map((line) => ({ warehouseId, productId: line.productId }));
  const stocks = await loadStocks(db, pairs);
  const now = new Date().toISOString();
  let resultDeltaTiyin = 0;
  const stockClaims = [];
  const stockSteps = lines.flatMap((line) => {
    const state = stockState(stocks, warehouseId, line.productId);
    if (state.version !== line.theoreticalStockVersion || state.quantityMilli !== line.theoreticalMilli) {
      throw commandError('Stock changed after this inventory snapshot was saved', 'stale_inventory_snapshot', 409, {
        productId: line.productId,
      });
    }
    const actualMilli = safeInteger(line.actualMilli, 'actualMilli');
    const delta = actualMilli - line.theoreticalMilli;
    resultDeltaTiyin += Math.round((delta * line.unitPriceTiyin) / 1000);
    stockClaims.push(claim('stock-item', state.id, state.version));
    return stockMutationSteps(db, {
      venueId, operationId, warehouseId, productId: line.productId, unit: line.unit,
      quantityMilli: actualMilli, version: state.version + 1, delta,
      reason: 'post_inventory', now, documentId: sessionId,
    });
  });
  return commandContext(db, adminUserId, operationId, venueId, 'post-inventory', payload, async () => ({
    claims: [claim('inventory-session', sessionId, session.version), ...stockClaims],
    steps: [
      db.tx.inventorySessions[sessionId].update({ status: 'posted', resultDeltaTiyin, version: session.version + 1 }),
      ...stockSteps,
    ],
    result: { sessionId, status: 'posted', resultDeltaTiyin },
  }));
}

async function cancelInventory(db, adminUserId, operationId, venueId, payload) {
  const sessionId = nonEmptyString(payload.sessionId, 'sessionId');
  const session = requireVenueEntity(await entityById(db, 'inventorySessions', sessionId), venueId, 'Inventory session');
  ensureDocumentStatus(session, ['draft'], 'Inventory session');
  return commandContext(db, adminUserId, operationId, venueId, 'cancel-inventory', payload, async () => ({
    claims: [claim('inventory-session', sessionId, session.version)],
    steps: [db.tx.inventorySessions[sessionId].update({ status: 'cancelled', version: session.version + 1 })],
    result: { sessionId, status: 'cancelled' },
  }));
}

async function restoreDocument(db, adminUserId, operationId, venueId, payload, config) {
  const documentId = nonEmptyString(payload.documentId, 'documentId');
  const document = requireVenueEntity(
    await entityById(db, config.namespace, documentId),
    venueId,
    config.name,
  );
  ensureDocumentStatus(document, ['cancelled'], config.name);
  return commandContext(db, adminUserId, operationId, venueId, config.kind, payload, async () => ({
    claims: [claim(config.resourceType, documentId, document.version)],
    steps: [db.tx[config.namespace][documentId].update({ status: 'draft', version: document.version + 1 })],
    result: { [config.resultKey]: documentId, status: 'draft' },
  }));
}


function normalizeWarehouseIds(value) {
  if (!Array.isArray(value)) throw commandError('warehouseIds must be an array');
  const ids = value.map((id, index) => nonEmptyString(id, `warehouseIds[${index}]`));
  if (new Set(ids).size !== ids.length) {
    throw commandError('warehouseIds must not contain duplicates', 'duplicate_warehouse', 400);
  }
  return ids;
}

async function validateWarehouses(db, warehouseIds, venueId) {
  const warehouses = await entitiesByIds(db, 'warehouses', warehouseIds);
  if (warehouses.length !== warehouseIds.length || warehouses.some((warehouse) => warehouse.venueId !== venueId)) {
    throw commandError('A warehouse was not found in this venue', 'not_found', 404);
  }
}

async function createIngredient(db, adminUserId, operationId, venueId, payload) {
  const name = nonEmptyString(payload.name, 'name');
  const unit = nonEmptyString(payload.unit, 'unit');
  const warehouseIds = normalizeWarehouseIds(payload.warehouseIds);
  const initialQuantityMilli = safeInteger(payload.initialQuantityMilli, 'initialQuantityMilli');
  if (initialQuantityMilli > 0 && warehouseIds.length === 0) {
    throw commandError('At least one warehouse is required for initial stock');
  }
  await validateWarehouses(db, warehouseIds, venueId);

  const productId = deterministicId('ingredient', venueId, operationId);
  const now = new Date().toISOString();
  const stockClaims = [];
  const stockSteps = warehouseIds.flatMap((warehouseId, index) => {
    const id = stockItemId(warehouseId, productId);
    stockClaims.push(claim('stock-item', id, 0));
    const quantityMilli = index === 0 ? initialQuantityMilli : 0;
    return stockMutationSteps(db, {
      venueId,
      operationId,
      warehouseId,
      productId,
      unit,
      quantityMilli,
      version: 1,
      delta: quantityMilli,
      reason: 'initial_stock',
      now,
      documentId: productId,
    });
  });

  return commandContext(db, adminUserId, operationId, venueId, 'create-ingredient', payload, async () => ({
    claims: [claim('product', productId, 0), ...stockClaims],
    steps: [
      db.tx.products[productId]
        .update({
          venueId,
          name,
          kind: 'ingredient',
          priceTiyin: 0,
          costTiyin: 0,
          unit,
          sortOrder: 0,
          status: 'active',
          version: 1,
          createdAt: now,
        })
        .link({ venue: venueId, warehouses: warehouseIds }),
      ...stockSteps,
    ],
    result: { productId },
  }));
}

async function updateIngredient(db, adminUserId, operationId, venueId, payload) {
  const productId = nonEmptyString(payload.productId, 'productId');
  const product = requireVenueEntity(
    await entityById(db, 'products', productId, { warehouses: {}, stockItems: { warehouse: {} } }),
    venueId,
    'Ingredient',
  );
  if (product.kind !== 'ingredient') throw commandError('Ingredient was not found', 'not_found', 404);

  const name = nonEmptyString(payload.name, 'name');
  const unit = nonEmptyString(payload.unit, 'unit');
  const warehouseIds = normalizeWarehouseIds(payload.warehouseIds);
  await validateWarehouses(db, warehouseIds, venueId);

  const currentVersion = Number.isSafeInteger(product.version) ? product.version : 0;
  const currentWarehouseIds = new Set((product.warehouses ?? []).map((warehouse) => warehouse.id));
  const removedWarehouseIds = [...currentWarehouseIds].filter((id) => !warehouseIds.includes(id));
  const pairs = warehouseIds.map((warehouseId) => ({ warehouseId, productId }));
  const stocks = await loadStocks(db, pairs);
  const now = new Date().toISOString();
  const stockClaims = [];
  const stockSteps = pairs.map(({ warehouseId }) => {
    const state = stockState(stocks, warehouseId, productId);
    stockClaims.push(claim('stock-item', state.id, state.version));
    return stockStep(db, venueId, warehouseId, productId, unit, state.quantityMilli, state.version + 1, now);
  });
  let productStep = db.tx.products[productId]
    .update({ name, unit, version: currentVersion + 1 })
    .link({ warehouses: warehouseIds });
  if (removedWarehouseIds.length > 0) {
    productStep = productStep.unlink({ warehouses: removedWarehouseIds });
  }

  return commandContext(db, adminUserId, operationId, venueId, 'update-ingredient', payload, async () => ({
    claims: [claim('product', productId, currentVersion), ...stockClaims],
    steps: [productStep, ...stockSteps],
    result: { productId },
  }));
}

const handlers = {
  'create-ingredient': createIngredient,
  'update-ingredient': updateIngredient,
  'create-delivery': createDelivery,
  'update-delivery': updateDelivery,
  'receive-delivery': (db, userId, operationId, venueId, payload) => transitionDelivery(db, userId, operationId, venueId, payload, 'receive'),
  'cancel-delivery': (db, userId, operationId, venueId, payload) => transitionDelivery(db, userId, operationId, venueId, payload, 'cancel'),
  'restore-delivery': (db, userId, operationId, venueId, payload) => restoreDocument(
    db, userId, operationId, venueId, payload,
    { namespace: 'deliveryDocuments', resourceType: 'delivery-document', name: 'Delivery', kind: 'restore-delivery', resultKey: 'deliveryId' },
  ),
  'create-write-off': createWriteOff,
  'update-write-off': updateWriteOff,
  'post-write-off': (db, userId, operationId, venueId, payload) => transitionWriteOff(db, userId, operationId, venueId, payload, 'post'),
  'cancel-write-off': (db, userId, operationId, venueId, payload) => transitionWriteOff(db, userId, operationId, venueId, payload, 'cancel'),
  'restore-write-off': (db, userId, operationId, venueId, payload) => restoreDocument(
    db, userId, operationId, venueId, payload,
    { namespace: 'writeOffDocuments', resourceType: 'write-off-document', name: 'Write-off', kind: 'restore-write-off', resultKey: 'writeOffId' },
  ),
  'create-transfer': createTransfer,
  'update-transfer': updateTransfer,
  'post-transfer': (db, userId, operationId, venueId, payload) => transitionTransfer(db, userId, operationId, venueId, payload, 'post'),
  'cancel-transfer': (db, userId, operationId, venueId, payload) => transitionTransfer(db, userId, operationId, venueId, payload, 'cancel'),
  'restore-transfer': (db, userId, operationId, venueId, payload) => restoreDocument(
    db, userId, operationId, venueId, payload,
    { namespace: 'transferDocuments', resourceType: 'transfer-document', name: 'Transfer', kind: 'restore-transfer', resultKey: 'transferId' },
  ),
  'create-inventory': createInventory,
  'save-inventory-lines': saveInventory,
  'update-inventory': updateInventory,
  'post-inventory': postInventory,
  'cancel-inventory': cancelInventory,
};

export async function runWarehouseCommand({ db, adminUserId, operationId, venueId, kind, payload }) {
  const replay = await replayInstantCommand({ db, operationId, venueId, kind, payload: payload ?? {} });
  if (replay.found) return replay.result;
  const handler = handlers[kind];
  if (!handler) throw commandError('Unknown warehouse command kind', 'unknown_command', 404);
  return handler(db, adminUserId, operationId, venueId, payload ?? {});
}
