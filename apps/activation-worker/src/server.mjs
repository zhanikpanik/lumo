import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { init } from '@instantdb/admin';
import { runInstantCommand } from './instant-command-runner.mjs';
import { runWarehouseCommand } from './warehouse-command-runner.mjs';
import { runStaffCommand } from './staff-command-runner.mjs';
import { runAdminCommand } from './admin-command-runner.mjs';
import { consumeRateLimit } from './rate-limit.mjs';
import {
  resolveActivationChallenge,
  resolveAdminMembership,
  resolveDeviceActivation,
} from './activation-policy.mjs';
import {
  projectFinancialContributionByKey,
  rebuildVenueAnalytics,
  runDetachedProjection,
} from './analytics-projector.mjs';
import { cancelRefund, closeShift, openShift, parseOrderLineSnapshot, payOrder, refundOrder } from '@lumo/data';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken, PORT = '3000' } = process.env;
if (!appId || !adminToken) {
  throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
}

const allowedOrigins = new Set(
  (process.env.ACTIVATION_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const db = init({ appId, adminToken });
const ACTIVATION_CHALLENGE_TTL_MS = 10 * 60_000;
const ACTIVATION_RESEND_AFTER_SECONDS = 60;


function send(response, status, body, origin) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
  });
  response.end(JSON.stringify(body));
}

function originFor(request) {
  const origin = request.headers.origin;
  return typeof origin === 'string' && allowedOrigins.has(origin) ? origin : null;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function requestIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  const candidate = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
    ?? request.socket.remoteAddress
    ?? 'unknown';
  return candidate.slice(0, 128);
}

function limitActivation(request, email, installationId) {
  consumeRateLimit('activation-ip', requestIp(request), { capacity: 20, periodMs: 60 * 60_000 });
  consumeRateLimit('activation-email', email, { capacity: 6, periodMs: 15 * 60_000 });
  consumeRateLimit('activation-installation', installationId, { capacity: 6, periodMs: 60 * 60_000 });
}

function linkedId(value) {
  if (Array.isArray(value)) return value[0]?.id ?? null;
  return value?.id ?? null;
}

function commandError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function deterministicUuid(kind, operationId) {
  const hex = createHash('sha256').update(`${kind}:${operationId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function queueFinancialProjection(venueId, operationId) {
  const contributionKey = `${venueId}:${operationId}`;
  runDetachedProjection(
    () => projectFinancialContributionByKey(db, venueId, contributionKey),
    (error) => console.error('Analytics projection failed', {
      venueId,
      contributionKey,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}


async function verifyBearerToken(request) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) throw commandError('Missing bearer token', 401);
  try {
    return await db.auth.verifyToken(authorization.slice('Bearer '.length));
  } catch {
    throw commandError('Invalid bearer token', 401);
  }
}

async function authorizeDevice(request) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) throw commandError('Missing bearer token', 401);

  let data;
  try {
    data = await db.asUser({ token: authorization.slice('Bearer '.length) }).query({
      $users: {
        $: { where: { 'devices.status': 'active' } },
        devices: {
          $: { where: { status: 'active' } },
          venue: {},
          authorizations: { $: { where: { status: 'active' } } },
        },
      },
    });
  } catch {
    throw commandError('Invalid bearer token', 401);
  }

  const devices = data.$users.flatMap((user) => user.devices ?? []);
  const device = devices.find(
    (candidate) => candidate.authorizations.some((authorization) => authorization.status === 'active'),
  );
  if (!device) throw commandError('An active device authorization is required', 403);

  const venueId = linkedId(device.venue);
  if (!venueId) throw commandError('Device is missing venue authorization', 403);
  return { id: device.id, venueId };
}

function entityForVenue(entities, id, venueId, name) {
  const entity = entities.find((candidate) => candidate.id === id && linkedId(candidate.venue) === venueId);
  if (!entity) throw commandError(`${name} does not belong to this device venue`, 403);
  return entity;
}

function resourceVersion(resource, name) {
  if (!Number.isSafeInteger(resource.version) || resource.version < 0) {
    throw commandError(`${name} is missing a valid concurrency version`, 409);
  }
  return resource.version;
}

function claim(resourceType, resource, name) {
  return { resourceType, resourceId: resource.id, expectedVersion: resourceVersion(resource, name) };
}

async function captureCommand(create) {
  let steps;
  const captureDb = {
    tx: db.tx,
    transact: async (value) => {
      if (steps) throw new Error('A command may construct only one InstantDB transaction');
      steps = Array.isArray(value) ? value : [value];
    },
  };
  const result = await create(captureDb);
  if (!steps) throw new Error('Command did not construct an InstantDB transaction');
  return { steps, result };
}

function orderFoodCostTiyin(order) {
  return order.items.reduce(
    (total, item) => total + parseOrderLineSnapshot(item.consumptionSnapshotJson)
      .consumption.reduce((lineTotal, consumption) => lineTotal + consumption.costTiyin, 0),
    0,
  );
}

async function createPosOrder(request, response, origin) {
  const device = await authorizeDevice(request);
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const shiftId = nonEmptyString(body.shiftId, 'shiftId');
  const actorEmployeeId = nonEmptyString(body.actorEmployeeId, 'actorEmployeeId');
  const orderNumber = nonEmptyString(body.orderNumber, 'orderNumber');
  const orderType = nonEmptyString(body.orderType, 'orderType');
  const guestCount = body.guestCount;
  if (!Number.isSafeInteger(guestCount) || guestCount < 1) throw commandError('guestCount must be a positive integer');
  if (typeof body.isQuickCheck !== 'boolean') throw commandError('isQuickCheck must be a boolean');

  const tableId = body.tableId === undefined ? undefined : nonEmptyString(body.tableId, 'tableId');
  const preflight = {
    shifts: { $: { where: { id: shiftId }, limit: 1 }, venue: {} },
    employees: { $: { where: { id: actorEmployeeId }, limit: 1 }, venue: {} },
    ...(tableId ? { tables: { $: { where: { id: tableId }, limit: 1 }, venue: {}, zone: {} } } : {}),
  };

  const result = await runInstantCommand(
    {
      db,
      operationId,
      venueId: device.venueId,
      kind: 'create-order',
      payload: body,
      deviceId: device.id,
      actorEmployeeId,
      preflight,
    },
    async (_command, references) => {
      const shift = entityForVenue(references.shifts, shiftId, device.venueId, 'Shift');
      if (shift.status !== 'open') throw commandError('Open shift is required', 409);
      const employee = entityForVenue(references.employees, actorEmployeeId, device.venueId, 'Employee');
      if (employee.status !== 'active') throw commandError('Active employee is required', 403);

      let table;
      if (tableId) {
        table = entityForVenue(references.tables, tableId, device.venueId, 'Table');
        if (table.status !== 'free') throw commandError('Table is not available', 409);
      }

      const now = new Date().toISOString();
      const orderId = deterministicUuid('order', `${device.venueId}:${operationId}`);
      const eventId = deterministicUuid('order-event-created', `${device.venueId}:${operationId}`);
      const shiftVersion = resourceVersion(shift, 'Shift');
      const tableVersion = table ? resourceVersion(table, 'Table') : undefined;
      const steps = [
        db.tx.orders[orderId]
          .update({
            venueId: device.venueId,
            operationId,
            number: orderNumber,
            status: 'active',
            guestCount,
            tableNumber: table?.number,
            zoneName: table ? (Array.isArray(table.zone) ? table.zone[0]?.name : table.zone?.name) : undefined,
            orderType,
            isQuickCheck: body.isQuickCheck,
            openedAt: now,
            totalAmountTiyin: 0,
            source: 'pos',
            createdAt: now,
            version: 0,
          })
          .link({
            venue: device.venueId,
            shift: shiftId,
            ...(table ? { table: table.id } : {}),
            ownerEmployee: actorEmployeeId,
            device: device.id,
          }),
        db.tx.orderEvents[eventId]
          .update({
            venueId: device.venueId,
            operationId: `${operationId}:created`,
            action: 'created',
            occurredAt: now,
            metadata: { orderNumber },
          })
          .link({ order: orderId, venue: device.venueId, actorEmployee: actorEmployeeId, device: device.id }),
        db.tx.shifts[shift.id].update({ version: shiftVersion + 1 }),
        ...(table ? [db.tx.tables[table.id].update({ version: tableVersion + 1 })] : []),
      ];
      return {
        claims: [claim('shift', shift, 'Shift'), ...(table ? [claim('table', table, 'Table')] : [])],
        steps,
        result: { orderId },
      };
    },
  );
  return send(response, 201, result, origin);
}





async function addPosOrderLine(request, response, origin) {
  const device = await authorizeDevice(request);
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const orderId = nonEmptyString(body.orderId, 'orderId');
  const productId = nonEmptyString(body.productId, 'productId');
  const actorEmployeeId = nonEmptyString(body.actorEmployeeId, 'actorEmployeeId');
  if (!Number.isSafeInteger(body.quantity) || body.quantity < 1) {
    throw commandError('quantity must be a positive integer');
  }
  if (!Number.isSafeInteger(body.guestNumber) || body.guestNumber < 1) {
    throw commandError('guestNumber must be a positive integer');
  }
  if (body.comment !== undefined && typeof body.comment !== 'string') throw commandError('comment must be a string');
  const modifierIds = body.modifierIds ?? [];
  if (
    !Array.isArray(modifierIds) ||
    modifierIds.length > 100 ||
    modifierIds.some((modifierId) => typeof modifierId !== 'string' || modifierId.trim() === '')
  ) {
    throw commandError('modifierIds must be an array of non-empty strings');
  }

  const result = await runInstantCommand(
    {
      db,
      operationId,
      venueId: device.venueId,
      kind: 'add-order-line',
      payload: body,
      deviceId: device.id,
      actorEmployeeId,
      preflight: {
        orders: { $: { where: { id: orderId }, limit: 1 }, venue: {} },
        employees: { $: { where: { id: actorEmployeeId }, limit: 1 }, venue: {} },
        products: {
          $: { where: { id: productId }, limit: 1 },
          venue: {},
          modifierGroups: { modifiers: {} },
          recipeItems: { ingredient: { venue: {} } },
        },
      },
    },
    async (_command, references) => {
      const order = entityForVenue(references.orders, orderId, device.venueId, 'Order');
      if (order.status !== 'active') throw commandError('Order is not active', 409);
      const employee = entityForVenue(references.employees, actorEmployeeId, device.venueId, 'Employee');
      if (employee.status !== 'active') throw commandError('Active employee is required', 403);
      const product = entityForVenue(references.products, productId, device.venueId, 'Product');
      if (product.status !== 'active') throw commandError('Product is not available', 409);

      const modifierGroups = (product.modifierGroups ?? []).filter((group) => group.status === 'active');
      const availableModifiers = new Map();
      for (const group of modifierGroups) {
        if (group.venueId !== device.venueId) {
          throw commandError('Product includes a modifier group outside this venue', 409);
        }
        for (const modifier of group.modifiers ?? []) {
          if (modifier.venueId !== device.venueId) {
            throw commandError('Product includes a modifier outside this venue', 409);
          }
          if (modifier.status === 'active') availableModifiers.set(modifier.id, { group, modifier });
        }
      }

      const selectedModifiers = modifierIds.map((modifierId) => {
        const selection = availableModifiers.get(modifierId);
        if (!selection) throw commandError('Modifier is not available for this product', 409);
        return selection;
      });
      const modifierCountByGroup = new Map();
      for (const { group } of selectedModifiers) {
        modifierCountByGroup.set(group.id, (modifierCountByGroup.get(group.id) ?? 0) + 1);
      }
      for (const group of modifierGroups) {
        const count = modifierCountByGroup.get(group.id) ?? 0;
        if (group.isRequired && count === 0) throw commandError(`Modifier group ${group.name} is required`, 409);
        if (group.maxSelect > 0 && count > group.maxSelect) {
          throw commandError(`Modifier group ${group.name} allows at most ${group.maxSelect}`, 409);
        }
      }

      const consumption = product.recipeItems.map((recipeItem) => {
        const ingredient = Array.isArray(recipeItem.ingredient) ? recipeItem.ingredient[0] : recipeItem.ingredient;
        if (!ingredient || linkedId(ingredient.venue) !== device.venueId) {
          throw commandError('Product recipe includes an ingredient outside this venue', 409);
        }
        const quantityMilli = recipeItem.quantityMilli * body.quantity;
        if (!Number.isSafeInteger(quantityMilli) || quantityMilli <= 0) {
          throw commandError('Recipe quantity is invalid', 409);
        }
        const unit = recipeItem.unit;
        const ingredientUnit = ingredient.unit;
        const unitCostTiyin = ingredient.costTiyin;
        const factor = unit === ingredientUnit ? 1
          : unit === 'g' && ingredientUnit === 'kg' ? 0.001
          : unit === 'kg' && ingredientUnit === 'g' ? 1000
          : unit === 'ml' && ingredientUnit === 'l' ? 0.001
          : unit === 'l' && ingredientUnit === 'ml' ? 1000
          : null;
        if (factor === null) throw commandError(`Unsupported recipe unit conversion: ${unit} to ${ingredientUnit}`, 409);
        const denominator = factor < 1 ? Math.round(1000 / factor) : 1000 / factor;
        const costTiyin = Math.round((quantityMilli * unitCostTiyin) / denominator);
        if (!Number.isSafeInteger(costTiyin) || costTiyin < 0) throw commandError('Recipe cost is invalid', 409);
        return { ingredientId: ingredient.id, quantityMilli, unit, ingredientUnit, unitCostTiyin, costTiyin };
      });

      const now = new Date().toISOString();
      const itemId = deterministicUuid('order-item', `${device.venueId}:${operationId}`);
      const eventId = deterministicUuid('order-event-item-added', `${device.venueId}:${operationId}`);
      const modifierUnitAmount = selectedModifiers.reduce(
        (sum, { modifier }) => sum + modifier.priceTiyin,
        0,
      );
      const lineAmount = (product.priceTiyin + modifierUnitAmount) * body.quantity;
      if (!Number.isSafeInteger(lineAmount) || lineAmount < 0) throw commandError('Product price is invalid', 409);
      const newTotal = order.totalAmountTiyin + lineAmount;
      if (!Number.isSafeInteger(newTotal)) throw commandError('Order total is invalid', 409);

      const orderVersion = resourceVersion(order, 'Order');
      const steps = [
        db.tx.orderItems[itemId]
          .update({
            venueId: device.venueId,
            operationId,
            productName: product.name,
            productPriceTiyin: product.priceTiyin,
            quantity: body.quantity,
            guestNumber: body.guestNumber,
            comment: body.comment,
            consumptionSnapshotJson: JSON.stringify({
              consumption,
              modifiers: selectedModifiers.map(({ modifier }) => ({
                id: modifier.id,
                name: modifier.name,
                priceTiyin: modifier.priceTiyin,
              })),
            }),
            createdAt: now,
          })
          .link({ order: orderId, product: productId }),
        ...selectedModifiers.map(({ modifier }, index) => {
          const modifierSnapshotId = deterministicUuid(
            'order-item-modifier',
            `${device.venueId}:${operationId}:${index}`,
          );
          return db.tx.orderItemModifiers[modifierSnapshotId]
            .update({
              venueId: device.venueId,
              modifierName: modifier.name,
              modifierPriceTiyin: modifier.priceTiyin,
            })
            .link({ orderItem: itemId, modifier: modifier.id });
        }),
        db.tx.orders[orderId].update({ totalAmountTiyin: newTotal, version: orderVersion + 1 }),
        db.tx.orderEvents[eventId]
          .update({
            venueId: device.venueId,
            operationId: `${operationId}:item-added`,
            action: 'item_added',
            occurredAt: now,
            metadata: { orderItemId: itemId },
          })
          .link({ order: orderId, venue: device.venueId, actorEmployee: actorEmployeeId, device: device.id }),
      ];
      return {
        claims: [claim('order', order, 'Order')],
        steps,
        result: { orderItemId: itemId, newTotal },
      };
    },
  );
  return send(response, 201, result, origin);
}

async function removePosOrderLine(request, response, origin) {
  const device = await authorizeDevice(request);
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const orderId = nonEmptyString(body.orderId, 'orderId');
  const orderItemId = nonEmptyString(body.orderItemId, 'orderItemId');
  const actorEmployeeId = nonEmptyString(body.actorEmployeeId, 'actorEmployeeId');

  const result = await runInstantCommand(
    {
      db,
      operationId,
      venueId: device.venueId,
      kind: 'remove-order-line',
      payload: body,
      deviceId: device.id,
      actorEmployeeId,
    },
    async () => {
      const references = await db.query({
        orders: { $: { where: { id: orderId }, limit: 1 }, venue: {} },
        orderItems: {
          $: { where: { id: orderItemId }, limit: 1 },
          order: { venue: {} },
          modifiers: {},
        },
        employees: { $: { where: { id: actorEmployeeId }, limit: 1 }, venue: {} },
      });
      const order = entityForVenue(references.orders, orderId, device.venueId, 'Order');
      if (order.status !== 'active') throw commandError('Order is not active', 409);
      const employee = entityForVenue(references.employees, actorEmployeeId, device.venueId, 'Employee');
      if (employee.status !== 'active') throw commandError('Active employee is required', 403);
      const orderItem = references.orderItems.find(
        (candidate) => candidate.id === orderItemId && linkedId(candidate.order) === orderId,
      );
      const itemOrder = Array.isArray(orderItem?.order) ? orderItem.order[0] : orderItem?.order;
      if (!orderItem || linkedId(itemOrder?.venue) !== device.venueId) {
        throw commandError('Order line does not belong to this order', 403);
      }

      const modifierAmount = (orderItem.modifiers ?? []).reduce(
        (sum, modifier) => sum + modifier.modifierPriceTiyin,
        0,
      );
      const lineAmount = (orderItem.productPriceTiyin + modifierAmount) * orderItem.quantity;
      const newTotal = Math.max(0, order.totalAmountTiyin - lineAmount);
      const now = new Date().toISOString();
      const eventId = deterministicUuid('order-event-item-removed', `${device.venueId}:${operationId}`);
      const orderVersion = resourceVersion(order, 'Order');
      const steps = [
        ...(orderItem.modifiers ?? []).map((modifier) => db.tx.orderItemModifiers[modifier.id].delete()),
        db.tx.orderItems[orderItemId].delete(),
        db.tx.orders[orderId].update({ totalAmountTiyin: newTotal, version: orderVersion + 1 }),
        db.tx.orderEvents[eventId]
          .update({
            venueId: device.venueId,
            operationId: `${operationId}:item-removed`,
            action: 'item_removed',
            occurredAt: now,
            metadata: { orderItemId },
          })
          .link({ order: orderId, venue: device.venueId, actorEmployee: actorEmployeeId, device: device.id }),
      ];
      return { claims: [claim('order', order, 'Order')], steps, result: { newTotal } };
    },
  );
  return send(response, 200, result, origin);
}
async function cancelPosOrder(request, response, origin) {
  const device = await authorizeDevice(request);
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const orderId = nonEmptyString(body.orderId, 'orderId');
  const actorEmployeeId = nonEmptyString(body.actorEmployeeId, 'actorEmployeeId');
  const closeReason = nonEmptyString(body.closeReason, 'closeReason');

  const result = await runInstantCommand(
    {
      db,
      operationId,
      venueId: device.venueId,
      kind: 'cancel-order',
      payload: body,
      deviceId: device.id,
      actorEmployeeId,
    },
    async () => {
      const references = await db.query({
        orders: { $: { where: { id: orderId }, limit: 1 }, venue: {} },
        employees: { $: { where: { id: actorEmployeeId }, limit: 1 }, venue: {} },
      });
      const order = entityForVenue(references.orders, orderId, device.venueId, 'Order');
      if (order.status !== 'active') throw commandError('Order is not active', 409);
      const employee = entityForVenue(references.employees, actorEmployeeId, device.venueId, 'Employee');
      if (employee.status !== 'active') throw commandError('Active employee is required', 403);

      const now = new Date().toISOString();
      const eventId = deterministicUuid('order-event-cancelled', `${device.venueId}:${operationId}`);
      const orderVersion = resourceVersion(order, 'Order');
      const steps = [
        db.tx.orders[orderId].update({ status: 'cancelled', closedAt: now, closeReason, version: orderVersion + 1 }),
        db.tx.orderEvents[eventId]
          .update({
            venueId: device.venueId,
            operationId: `${operationId}:cancelled`,
            action: 'cancelled',
            occurredAt: now,
            metadata: { closeReason },
          })
          .link({ order: orderId, venue: device.venueId, actorEmployee: actorEmployeeId, device: device.id }),
      ];
      return {
        claims: [claim('order', order, 'Order')],
        steps,
        result: { orderId, status: 'cancelled' },
      };
    },
  );
  return send(response, 200, result, origin);
}


async function updatePosOrder(request, response, origin) {
  const device = await authorizeDevice(request);
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const orderId = nonEmptyString(body.orderId, 'orderId');
  const actorEmployeeId = nonEmptyString(body.actorEmployeeId, 'actorEmployeeId');
  if (!body.updates || typeof body.updates !== 'object' || Array.isArray(body.updates)) {
    throw commandError('updates must be an object');
  }
  const { guestCount, comment, ownerEmployeeId, tableId } = body.updates;
  if (guestCount !== undefined && (!Number.isSafeInteger(guestCount) || guestCount < 1)) {
    throw commandError('guestCount must be a positive integer');
  }
  if (comment !== undefined && typeof comment !== 'string') throw commandError('comment must be a string');
  if (ownerEmployeeId !== undefined && typeof ownerEmployeeId !== 'string') {
    throw commandError('ownerEmployeeId must be a string');
  }
  if (tableId !== undefined && typeof tableId !== 'string') throw commandError('tableId must be a string');
  if (guestCount === undefined && comment === undefined && ownerEmployeeId === undefined && tableId === undefined) {
    throw commandError('No supported order fields were provided');
  }

  const result = await runInstantCommand(
    {
      db,
      operationId,
      venueId: device.venueId,
      kind: 'update-order',
      payload: body,
      deviceId: device.id,
      actorEmployeeId,
    },
    async () => {
      const employeeIds = [...new Set([actorEmployeeId, ownerEmployeeId].filter(Boolean))];
      const references = await db.query({
        orders: { $: { where: { id: orderId }, limit: 1 }, venue: {} },
        employees: { $: { where: { id: { $in: employeeIds } }, limit: employeeIds.length }, venue: {} },
        ...(tableId ? { tables: { $: { where: { id: tableId }, limit: 1 }, venue: {}, zone: {} } } : {}),
      });
      const order = entityForVenue(references.orders, orderId, device.venueId, 'Order');
      if (order.status !== 'active') throw commandError('Order is not active', 409);
      const actor = entityForVenue(references.employees, actorEmployeeId, device.venueId, 'Employee');
      if (actor.status !== 'active') throw commandError('Active employee is required', 403);
      if (ownerEmployeeId !== undefined) {
        const owner = entityForVenue(references.employees, ownerEmployeeId, device.venueId, 'Employee');
        if (owner.status !== 'active') throw commandError('New order owner must be active', 409);
      }
      const table = tableId === undefined ? undefined : entityForVenue(references.tables, tableId, device.venueId, 'Table');
      if (table && table.status !== 'free') throw commandError('Table is not available', 409);

      const orderVersion = resourceVersion(order, 'Order');
      const tableVersion = table ? resourceVersion(table, 'Table') : undefined;
      const fields = {
        ...(guestCount !== undefined ? { guestCount } : {}),
        ...(comment !== undefined ? { comment } : {}),
        ...(table ? {
          tableNumber: table.number,
          zoneName: Array.isArray(table.zone) ? table.zone[0]?.name : table.zone?.name,
          isQuickCheck: false,
        } : {}),
        version: orderVersion + 1,
      };
      const orderStep = db.tx.orders[orderId]
          .update(fields)

          .link({
            ...(ownerEmployeeId !== undefined ? { ownerEmployee: ownerEmployeeId } : {}),
            ...(table ? { table: table.id } : {}),
          });
      const steps = [
        orderStep,
        ...(table ? [db.tx.tables[table.id].update({ version: tableVersion + 1 })] : []),
      ];
      return {
        claims: [claim('order', order, 'Order'), ...(table ? [claim('table', table, 'Table')] : [])],
        steps,
        result: { orderId },
      };
    },
  );
  return send(response, 200, result, origin);
}

async function payPosOrder(request, response, origin) {
  const device = await authorizeDevice(request);
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const orderId = nonEmptyString(body.orderId, 'orderId');
  const shiftId = nonEmptyString(body.shiftId, 'shiftId');
  const actorEmployeeId = nonEmptyString(body.actorEmployeeId, 'actorEmployeeId');
  if (body.method !== 'cash' && body.method !== 'card') throw commandError('method must be cash or card');
  if (body.tenderedCashTiyin !== undefined && (!Number.isSafeInteger(body.tenderedCashTiyin) || body.tenderedCashTiyin < 0)) {
    throw commandError('tenderedCashTiyin must be a non-negative integer');
  }

  const result = await runInstantCommand(
    {
      db,
      operationId,
      venueId: device.venueId,
      kind: 'pay-order',
      payload: body,
      deviceId: device.id,
      actorEmployeeId,
    },
    async ({ operationEntityId, operationKey }) => {
      const references = await db.query({
        orders: { $: { where: { id: orderId }, limit: 1 }, venue: {}, items: {} },
        shifts: { $: { where: { id: shiftId }, limit: 1 }, venue: {} },
        employees: { $: { where: { id: actorEmployeeId }, limit: 1 }, venue: {} },
      });
      const order = entityForVenue(references.orders, orderId, device.venueId, 'Order');
      if (order.status !== 'active') throw commandError('Order is not active', 409);
      const shift = entityForVenue(references.shifts, shiftId, device.venueId, 'Shift');
      if (shift.status !== 'open') throw commandError('Open shift is required', 409);
      const employee = entityForVenue(references.employees, actorEmployeeId, device.venueId, 'Employee');
      if (employee.status !== 'active') throw commandError('Active employee is required', 403);
      const now = new Date().toISOString();
      const captured = await captureCommand((commandDb) => payOrder(commandDb, {
        operationId, venueId: device.venueId, shiftId, orderId, deviceId: device.id, actorEmployeeId,
        method: body.method, tenderedCashTiyin: body.tenderedCashTiyin, clientTimestamp: now,
      }, {
        id: order.id, status: order.status, totalAmountTiyin: order.totalAmountTiyin,
        items: order.items.map((item) => ({ id: item.id, consumptionSnapshotJson: item.consumptionSnapshotJson })),
      }).execute());
      const orderVersion = resourceVersion(order, 'Order');
      const shiftVersion = resourceVersion(shift, 'Shift');
      const contributionId = deterministicUuid('financial-contribution', operationKey);
      return {
        claims: [claim('order', order, 'Order'), claim('shift', shift, 'Shift')],
        steps: [
          ...captured.steps,
          db.tx.orders[order.id].update({ version: orderVersion + 1 }),
          db.tx.shifts[shift.id].update({ version: shiftVersion + 1 }),
          db.tx.financialContributions[contributionId]
            .update({
              contributionKey: operationKey,
              operationKey,
              venueId: device.venueId,
              kind: 'sale',
              revenueDeltaTiyin: order.totalAmountTiyin,
              foodCostDeltaTiyin: orderFoodCostTiyin(order),
              cashDeltaTiyin: body.method === 'cash' ? order.totalAmountTiyin : 0,
              occurredAt: now,
            })
            .link({
              operation: operationEntityId,
              venue: device.venueId,
              order: orderId,
              payment: captured.result.paymentId,
            }),
        ],
        result: captured.result,
      };
    },
  );
  send(response, 200, result, origin);
  queueFinancialProjection(device.venueId, operationId);
}

async function openPosShift(request, response, origin) {
  const device = await authorizeDevice(request);
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const actorEmployeeId = nonEmptyString(body.actorEmployeeId, 'actorEmployeeId');
  if (!Number.isSafeInteger(body.startingCashTiyin) || body.startingCashTiyin < 0) {
    throw commandError('startingCashTiyin must be a non-negative integer');
  }
  const result = await runInstantCommand(
    {
      db,
      operationId,
      venueId: device.venueId,
      kind: 'open-shift',
      payload: body,
      deviceId: device.id,
      actorEmployeeId,
    },
    async () => {
      const references = await db.query({
        venues: { $: { where: { id: device.venueId }, limit: 1 } },
        shifts: {
          $: { where: { 'venue.id': device.venueId, status: 'open' }, limit: 2 },
          venue: {},
        },
        employees: { $: { where: { id: actorEmployeeId }, limit: 1 }, venue: {} },
      });
      const employee = entityForVenue(references.employees, actorEmployeeId, device.venueId, 'Employee');
      if (employee.status !== 'active') throw commandError('Active employee is required', 403);
      const venue = references.venues[0];
      if (!venue) throw commandError('Device venue was not found', 403);
      const currentShift = references.shifts.find((shift) => linkedId(shift.venue) === device.venueId && shift.status === 'open') ?? null;
      const captured = await captureCommand((commandDb) => openShift(commandDb, {
        operationId, venueId: device.venueId, deviceId: device.id, actorEmployeeId,
        startingCashTiyin: body.startingCashTiyin, clientTimestamp: new Date().toISOString(),
      }).execute(currentShift));
      const venueVersion = resourceVersion(venue, 'Venue');
      return {
        claims: [claim('venue', venue, 'Venue')],
        steps: [...captured.steps, db.tx.venues[venue.id].update({ version: venueVersion + 1 })],
        result: captured.result,
      };
    },
  );
  return send(response, 201, result, origin);
}

async function closePosShift(request, response, origin) {
  const device = await authorizeDevice(request);
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const shiftId = nonEmptyString(body.shiftId, 'shiftId');
  if (!Number.isSafeInteger(body.countedCashTiyin) || body.countedCashTiyin < 0) {
    throw commandError('countedCashTiyin must be a non-negative integer');
  }
  if (body.closingNote !== undefined && typeof body.closingNote !== 'string') throw commandError('closingNote must be a string');
  const result = await runInstantCommand(
    {
      db,
      operationId,
      venueId: device.venueId,
      kind: 'close-shift',
      payload: body,
      deviceId: device.id,
    },
    async () => {
      const shifts = await db.query({
        shifts: { $: { where: { id: shiftId }, limit: 1 }, venue: {} },
      });
      const shift = entityForVenue(shifts.shifts, shiftId, device.venueId, 'Shift');
      const captured = await captureCommand((commandDb) => closeShift(commandDb, {
        operationId,
        venueId: device.venueId,
        shiftId,
        countedCashTiyin: body.countedCashTiyin,
        closingNote: body.closingNote,
        clientTimestamp: new Date().toISOString(),
      }).execute({ id: shift.id, status: shift.status }));
      const shiftVersion = resourceVersion(shift, 'Shift');
      return {
        claims: [claim('shift', shift, 'Shift')],
        steps: [...captured.steps, db.tx.shifts[shift.id].update({ version: shiftVersion + 1 })],
        result: captured.result,
      };
    },
  );
  return send(response, 200, result, origin);
}

async function createCashMovement(request, response, origin) {
  const device = await authorizeDevice(request);
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const shiftId = nonEmptyString(body.shiftId, 'shiftId');
  if (!['collection', 'float_in', 'float_out'].includes(body.movementType)) throw commandError('Invalid movementType');
  if (!Number.isSafeInteger(body.amountTiyin) || body.amountTiyin <= 0) throw commandError('amountTiyin must be positive');
  const result = await runInstantCommand(
    {
      db,
      operationId,
      venueId: device.venueId,
      kind: 'cash-movement',
      payload: body,
      deviceId: device.id,
    },
    async () => {
      const shifts = await db.query({
        shifts: { $: { where: { id: shiftId }, limit: 1 }, venue: {} },
      });
      const shift = entityForVenue(shifts.shifts, shiftId, device.venueId, 'Shift');
      if (shift.status !== 'open') throw commandError('Open shift is required', 409);
      const id = deterministicUuid('cash-movement', `${device.venueId}:${operationId}`);
      const now = new Date().toISOString();
      const shiftVersion = resourceVersion(shift, 'Shift');
      const steps = [db.tx.cashMovements[id].update({
        venueId: device.venueId, operationId, movementType: body.movementType,
        amountTiyin: body.amountTiyin, note: body.note, occurredAt: now, createdAt: now,
      }).link({ shift: shiftId, venue: device.venueId }),
      db.tx.shifts[shift.id].update({ version: shiftVersion + 1 })];
      return {
        claims: [claim('shift', shift, 'Shift')],
        steps,
        result: { cashMovementId: id },
      };
    },
  );
  return send(response, 201, result, origin);
}

async function refundPosOrder(request, response, origin) {
  const device = await authorizeDevice(request);
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const orderId = nonEmptyString(body.orderId, 'orderId');
  const shiftId = nonEmptyString(body.shiftId, 'shiftId');
  const actorEmployeeId = nonEmptyString(body.actorEmployeeId, 'actorEmployeeId');
  const result = await runInstantCommand({
    db, operationId, venueId: device.venueId, kind: 'refund-order', payload: body,
    deviceId: device.id, actorEmployeeId,
  }, async ({ operationEntityId, operationKey }) => {
    const refs = await db.query({
      orders: { $: { where: { id: orderId }, limit: 1 }, venue: {}, items: {}, payments: {} },
      shifts: { $: { where: { id: shiftId }, limit: 1 }, venue: {} },
      employees: { $: { where: { id: actorEmployeeId }, limit: 1 }, venue: {} },
    });
    const order = entityForVenue(refs.orders, orderId, device.venueId, 'Order');
    const shift = entityForVenue(refs.shifts, shiftId, device.venueId, 'Shift');
    const employee = entityForVenue(refs.employees, actorEmployeeId, device.venueId, 'Employee');
    if (employee.status !== 'active') throw commandError('Active employee is required', 403);
    const originalPayment = order.payments[0];
    if (!originalPayment) throw commandError('Original payment was not found', 409);
    const now = new Date().toISOString();
    const captured = await captureCommand((commandDb) => refundOrder(commandDb, {
      operationId, venueId: device.venueId, shiftId, orderId, deviceId: device.id, actorEmployeeId,
      reason: body.reason, clientTimestamp: now,
    }, order).execute());
    const orderVersion = resourceVersion(order, 'Order');
    const shiftVersion = resourceVersion(shift, 'Shift');
    const contributionId = deterministicUuid('financial-contribution', operationKey);
    return {
      claims: [claim('order', order, 'Order'), claim('shift', shift, 'Shift')],
      steps: [
        ...captured.steps,
        db.tx.orders[order.id].update({ version: orderVersion + 1 }),
        db.tx.shifts[shift.id].update({ version: shiftVersion + 1 }),
        db.tx.financialContributions[contributionId]
          .update({
            contributionKey: operationKey, operationKey, venueId: device.venueId, kind: 'refund',
            revenueDeltaTiyin: -originalPayment.amountTiyin,
            foodCostDeltaTiyin: -originalPayment.foodCostTiyin,
            cashDeltaTiyin: originalPayment.method === 'cash' ? -originalPayment.amountTiyin : 0,
            occurredAt: now,
          })
          .link({
            operation: operationEntityId, venue: device.venueId, order: orderId,
            payment: captured.result.refundPaymentId,
          }),
      ],
      result: captured.result,
    };
  });
  send(response, 200, result, origin);
  queueFinancialProjection(device.venueId, operationId);
}

async function cancelPosRefund(request, response, origin) {
  const device = await authorizeDevice(request);
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const orderId = nonEmptyString(body.orderId, 'orderId');
  const shiftId = nonEmptyString(body.shiftId, 'shiftId');
  const actorEmployeeId = nonEmptyString(body.actorEmployeeId, 'actorEmployeeId');
  const result = await runInstantCommand({
    db, operationId, venueId: device.venueId, kind: 'cancel-refund', payload: body,
    deviceId: device.id, actorEmployeeId,
  }, async ({ operationEntityId, operationKey }) => {
    const refs = await db.query({
      orders: { $: { where: { id: orderId }, limit: 1 }, venue: {}, items: {}, payments: {} },
      shifts: { $: { where: { id: shiftId }, limit: 1 }, venue: {} },
      employees: { $: { where: { id: actorEmployeeId }, limit: 1 }, venue: {} },
    });
    const order = entityForVenue(refs.orders, orderId, device.venueId, 'Order');
    const shift = entityForVenue(refs.shifts, shiftId, device.venueId, 'Shift');
    const employee = entityForVenue(refs.employees, actorEmployeeId, device.venueId, 'Employee');
    if (employee.status !== 'active') throw commandError('Active employee is required', 403);
    const originalPayment = order.payments.find((payment) => payment.method !== 'refund');
    if (!originalPayment) throw commandError('Original payment was not found', 409);
    const refundPayment = order.payments.find((payment) => payment.method === 'refund');
    if (!refundPayment) throw commandError('Refund payment was not found', 409);
    const now = new Date().toISOString();
    const captured = await captureCommand((commandDb) => cancelRefund(commandDb, {
      operationId, venueId: device.venueId, shiftId, orderId, deviceId: device.id, actorEmployeeId,
      clientTimestamp: now,
    }, order).execute());
    const orderVersion = resourceVersion(order, 'Order');
    const shiftVersion = resourceVersion(shift, 'Shift');
    const contributionId = deterministicUuid('financial-contribution', operationKey);
    return {
      claims: [claim('order', order, 'Order'), claim('shift', shift, 'Shift')],
      steps: [
        ...captured.steps,
        db.tx.orders[order.id].update({ version: orderVersion + 1 }),
        db.tx.shifts[shift.id].update({ version: shiftVersion + 1 }),
        db.tx.financialContributions[contributionId]
          .update({
            contributionKey: operationKey, operationKey, venueId: device.venueId, kind: 'cancel_refund',
            revenueDeltaTiyin: refundPayment.amountTiyin,
            foodCostDeltaTiyin: refundPayment.foodCostTiyin,
            cashDeltaTiyin: originalPayment.method === 'cash' ? refundPayment.amountTiyin : 0,
            occurredAt: now,
          })
          .link({
            operation: operationEntityId, venue: device.venueId, order: orderId,
            payment: refundPayment.id,
          }),
      ],
      result: captured.result,
    };
  });
  send(response, 200, result, origin);
  queueFinancialProjection(device.venueId, operationId);
}

async function membershipsFor(userId) {
  const data = await db.query({
    memberships: {
      $: { where: { 'user.id': userId, status: 'active' }, limit: 100 },
      user: {},
      venue: {},
      organization: {},
    },
  });
  return data.memberships;
}

async function authorizeAdmin(request, venueId) {
  const user = await verifyBearerToken(request);
  const membership = resolveAdminMembership(await membershipsFor(user.id), venueId);
  if (!membership) {
    const error = new Error('Owner or manager membership is required');
    error.statusCode = 403;
    throw error;
  }
  return user;
}

async function executeAdminWarehouseCommand(request, response, origin) {
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const venueId = nonEmptyString(body.venueId, 'venueId');
  const kind = nonEmptyString(body.kind, 'kind');
  const admin = await authorizeAdmin(request, venueId);
  consumeRateLimit('admin-warehouse-user', admin.id, { capacity: 300, periodMs: 60_000 });
  const result = await runWarehouseCommand({
    db,
    adminUserId: admin.id,
    operationId,
    venueId,
    kind,
    payload: body.payload,
  });
  return send(response, 200, result, origin);
}

async function executeAdminStaffCommand(request, response, origin) {
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const venueId = nonEmptyString(body.venueId, 'venueId');
  const kind = nonEmptyString(body.kind, 'kind');
  const admin = await authorizeAdmin(request, venueId);
  consumeRateLimit('admin-staff-user', admin.id, { capacity: 60, periodMs: 60_000 });
  const result = await runStaffCommand({
    db,
    adminUserId: admin.id,
    operationId,
    venueId,
    kind,
    payload: body.payload,
  });
  return send(response, 200, result, origin);
}

async function executeAdminOperationalCommand(request, response, origin) {
  const body = await readJson(request);
  const operationId = nonEmptyString(body.operationId, 'operationId');
  const venueId = nonEmptyString(body.venueId, 'venueId');
  const kind = nonEmptyString(body.kind, 'kind');
  const admin = await authorizeAdmin(request, venueId);
  consumeRateLimit('admin-operational-user', admin.id, { capacity: 120, periodMs: 60_000 });
  const result = await runAdminCommand({
    db,
    adminUserId: admin.id,
    operationId,
    venueId,
    kind,
    payload: body.payload,
  });
  return send(response, 200, result, origin);
}

async function rebuildAdminAnalytics(request, response, origin) {
  const body = await readJson(request);
  const venueId = nonEmptyString(body.venueId, 'venueId');
  const rebuildId = nonEmptyString(body.rebuildId, 'rebuildId');
  const admin = await authorizeAdmin(request, venueId);
  consumeRateLimit('admin-analytics-rebuild-user', admin.id, { capacity: 3, periodMs: 60 * 60_000 });
  const result = await rebuildVenueAnalytics(db, venueId, rebuildId);
  return send(response, 200, result, origin);
}

async function recordPosUnlockAttempts(request, response, origin) {
  const device = await authorizeDevice(request);
  consumeRateLimit('pos-unlock-attempts-device', device.id, { capacity: 120, periodMs: 60_000 });
  const body = await readJson(request);
  if (!Array.isArray(body.attempts) || body.attempts.length === 0 || body.attempts.length > 100) {
    throw commandError('attempts must contain between 1 and 100 entries');
  }
  const now = Date.now();
  const attempts = body.attempts.map((attempt, index) => {
    const id = nonEmptyString(attempt?.id, `attempts[${index}].id`);
    const occurredAt = nonEmptyString(attempt?.occurredAt, `attempts[${index}].occurredAt`);
    const occurredAtMs = Date.parse(occurredAt);
    if (!Number.isFinite(occurredAtMs) || occurredAtMs > now + 5 * 60_000 || occurredAtMs < now - 7 * 24 * 60 * 60_000) {
      throw commandError(`attempts[${index}].occurredAt is outside the accepted range`);
    }
    if (attempt.outcome !== 'success' && attempt.outcome !== 'failure') {
      throw commandError(`attempts[${index}].outcome is invalid`);
    }
    return {
      id,
      occurredAt,
      outcome: attempt.outcome,
      employeeId: typeof attempt.employeeId === 'string' ? attempt.employeeId : undefined,
    };
  });
  const employeeIds = [...new Set(attempts.flatMap((attempt) => attempt.employeeId ? [attempt.employeeId] : []))];
  const references = await db.query({
    venues: { $: { where: { id: device.venueId }, limit: 1 }, organization: {} },
    ...(employeeIds.length > 0 ? {
      employees: { $: { where: { id: { $in: employeeIds } }, limit: employeeIds.length }, venue: {} },
    } : {}),
  });
  const organizationId = linkedId(references.venues[0]?.organization);
  if (!organizationId) throw commandError('Venue organization was not found', 409);
  const validEmployeeIds = new Set(
    (references.employees ?? [])
      .filter((employee) => linkedId(employee.venue) === device.venueId)
      .map((employee) => employee.id),
  );
  if (employeeIds.some((employeeId) => !validEmployeeIds.has(employeeId))) {
    throw commandError('An unlock attempt contains an invalid employeeId');
  }
  const steps = attempts.map((attempt) =>
    db.tx.auditEvents[deterministicUuid('offline-unlock-attempt', `${device.venueId}:${device.id}:${attempt.id}`)]
      .update({
        venueId: device.venueId,
        action: attempt.outcome === 'success' ? 'offline_unlock_success' : 'offline_unlock_failure',
        occurredAt: attempt.occurredAt,
        metadata: { attemptId: attempt.id, source: 'pos_offline_queue' },
      })
      .link({
        organization: organizationId,
        venue: device.venueId,
        device: device.id,
        ...(attempt.employeeId ? { employee: attempt.employeeId } : {}),
      }),
  );
  await db.transact(steps);
  return send(response, 200, { acceptedIds: attempts.map((attempt) => attempt.id) }, origin);
}

async function requestDeviceActivationMagicCode(request, response, origin) {
  const body = await readJson(request);
  const email = nonEmptyString(body.email, 'email').toLowerCase();
  const installationId = nonEmptyString(body.installationId, 'installationId');
  limitActivation(request, email, installationId);
  consumeRateLimit('activation-resend', `${email}:${installationId}`, {
    capacity: 1,
    periodMs: ACTIVATION_RESEND_AFTER_SECONDS * 1_000,
  });
  await db.auth.sendMagicCode(email);
  return send(response, 202, { resendAfterSeconds: ACTIVATION_RESEND_AFTER_SECONDS }, origin);
}

function activationVenue(membership) {
  const venue = Array.isArray(membership.venue) ? membership.venue[0] : membership.venue;
  if (!venue?.id) throw new Error('Membership is missing venue');
  return { id: venue.id, name: venue.name };
}

async function activateAuthorizedDevice({
  adminUserId,
  membership,
  installationId,
  label,
  platform,
  challenge,
}) {
  const occurredAt = new Date().toISOString();
  const venueId = linkedId(membership.venue);
  if (!venueId) throw new Error('Membership is missing venue');
  const organizationId = linkedId(membership.organization);
  if (!organizationId) throw new Error('Membership is missing organization');
  const devices = await db.query({
    devices: {
      $: { where: { installationId }, limit: 1 },
      venue: {},
      authUser: {},
      authorizations: {},
    },
  });
  const existing = devices.devices[0];
  if (existing && linkedId(existing.venue) !== venueId) {
    throw commandError('Installation is already bound to another venue', 409);
  }
  const challengeSteps = challenge
    ? [
        db.tx.activationChallenges[challenge.id].update({ status: 'consumed', consumedAt: occurredAt }),
        db.tx.activationChallengeClaims[randomUUID()].update({
          claimKey: challenge.challengeHash,
          challengeId: challenge.id,
          createdAt: occurredAt,
        }),
      ]
    : [];

  if (existing) {
    const deviceUserId = linkedId(existing.authUser);
    if (!deviceUserId) throw new Error('Existing device is missing an auth user');
    const authorizationId = randomUUID();
    const auditEventId = randomUUID();
    await db.transact([
      ...challengeSteps,
      db.tx.devices[existing.id].update({ label, platform, status: 'active' }),
      ...existing.authorizations
        .filter((authorization) => authorization.status === 'active')
        .map((authorization) =>
          db.tx.deviceAuthorizations[authorization.id].update({ status: 'revoked', revokedAt: occurredAt }),
        ),
      db.tx.deviceAuthorizations[authorizationId]
        .update({ status: 'active', activatedAt: occurredAt })
        .link({ device: existing.id, venue: venueId, activatedBy: adminUserId }),
      db.tx.venues[venueId].link({ activeDeviceUsers: [deviceUserId] }),
      db.tx.auditEvents[auditEventId]
        .update({
          venueId,
          action: 'device_reactivated',
          occurredAt,
          metadata: { installationId, label, platform, venueId },
        })
        .link({
          organization: organizationId,
          venue: venueId,
          device: existing.id,
          adminUser: adminUserId,
        }),
    ]);
    await db.auth.signOut({ id: deviceUserId });
    const token = await db.auth.createToken({ email: `device-${existing.id}@devices.invalid` });
    return { deviceId: existing.id, venueId, token };
  }

  const deviceId = randomUUID();
  const authorizationId = randomUUID();
  const auditEventId = randomUUID();
  const deviceEmail = `device-${deviceId}@devices.invalid`;
  const deviceToken = await db.auth.createToken({ email: deviceEmail });
  const deviceUser = await db.auth.getUser({ email: deviceEmail });
  if (!deviceUser) throw new Error('Could not create the device auth user');

  try {
    await db.transact([
      ...challengeSteps,
      db.tx.devices[deviceId]
        .update({ installationId, label, platform, status: 'active', createdAt: occurredAt })
        .link({ venue: venueId, authUser: deviceUser.id }),
      db.tx.deviceAuthorizations[authorizationId]
        .update({ status: 'active', activatedAt: occurredAt })
        .link({ device: deviceId, venue: venueId, activatedBy: adminUserId }),
      db.tx.venues[venueId].link({ activeDeviceUsers: [deviceUser.id] }),
      db.tx.auditEvents[auditEventId]
        .update({
          venueId,
          action: 'device_activated',
          occurredAt,
          metadata: { installationId, label, platform, venueId },
        })
        .link({
          organization: organizationId,
          venue: venueId,
          device: deviceId,
          adminUser: adminUserId,
        }),
    ]);
    return { deviceId, venueId, token: deviceToken };
  } catch (cause) {
    const retry = await db.query({
      devices: {
        $: { where: { installationId }, limit: 1 },
        venue: {},
        authUser: {},
        authorizations: {},
      },
    });
    const raced = retry.devices[0];
    await db.auth.signOut({ id: deviceUser.id }).catch(() => {});
    if (!raced) throw cause;
    if (linkedId(raced.venue) !== venueId) {
      throw commandError('Installation is already bound to another venue', 409);
    }
    return activateAuthorizedDevice({
      adminUserId,
      membership,
      installationId,
      label,
      platform,
      challenge,
    });
  }
}

async function beginDeviceActivation(request, response, origin) {
  const body = await readJson(request);
  const email = nonEmptyString(body.email, 'email').toLowerCase();
  const magicCode = nonEmptyString(body.magicCode, 'magicCode');
  const installationId = nonEmptyString(body.installationId, 'installationId');
  const label = nonEmptyString(body.label, 'label');
  const platform = nonEmptyString(body.platform, 'platform');
  limitActivation(request, email, installationId);
  const verification = await db.auth.checkMagicCode(email, magicCode);
  const memberships = await membershipsFor(verification.user.id);

  const existingDevices = await db.query({
    devices: { $: { where: { installationId }, limit: 1 }, venue: {} },
  });
  const resolution = resolveDeviceActivation(
    memberships,
    linkedId(existingDevices.devices[0]?.venue),
  );
  if (resolution.kind === 'forbidden') {
    throw commandError('An active owner or manager membership is required', 403);
  }
  if (resolution.kind === 'forbidden-existing') {
    throw commandError('An active owner or manager membership is required for this device venue', 403);
  }
  if (resolution.kind === 'activate') {
    const activation = await activateAuthorizedDevice({
      adminUserId: verification.user.id,
      membership: resolution.membership,
      installationId,
      label,
      platform,
    });
    return send(response, existingDevices.devices[0] ? 200 : 201, {
      status: 'activated',
      activation,
    }, origin);
  }
  const eligibleMemberships = resolution.memberships;

  const activationChallenge = randomBytes(32).toString('base64url');
  const challengeHash = createHash('sha256').update(activationChallenge).digest('hex');
  const challengeId = randomUUID();
  const createdAt = new Date();
  const challengeVenues = eligibleMemberships.map((membership) => ({
    ...activationVenue(membership),
    membershipId: membership.id,
    organizationId: linkedId(membership.organization),
  }));
  await db.transact(
    db.tx.activationChallenges[challengeId].update({
      challengeHash,
      adminUserId: verification.user.id,
      email,
      installationId,
      label,
      platform,
      venuesJson: JSON.stringify(challengeVenues),
      status: 'pending',
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + ACTIVATION_CHALLENGE_TTL_MS).toISOString(),
    }),
  );
  return send(response, 200, {
    status: 'venue-selection',
    selection: {
      activationChallenge,
      venues: challengeVenues.map(({ id, name }) => ({ id, name })),
    },
  }, origin);
}

async function completeDeviceActivation(request, response, origin) {
  const body = await readJson(request);
  const activationChallenge = nonEmptyString(body.activationChallenge, 'activationChallenge');
  const venueId = nonEmptyString(body.venueId, 'venueId');
  const challengeHash = createHash('sha256').update(activationChallenge).digest('hex');
  const challengeData = await db.query({
    activationChallenges: { $: { where: { challengeHash }, limit: 1 } },
  });
  const challenge = challengeData.activationChallenges[0];
  const resolution = resolveActivationChallenge(challenge, venueId);
  if (resolution.kind === 'invalid') {
    throw commandError('Activation challenge is invalid or expired', 409);
  }
  if (resolution.kind === 'forbidden') {
    throw commandError('Venue is not allowed by this activation challenge', 403);
  }
  const membership = {
    id: resolution.venue.membershipId,
    venue: [{ id: resolution.venue.id, name: resolution.venue.name }],
    organization: [{ id: resolution.venue.organizationId }],
  };
  const activation = await activateAuthorizedDevice({
    adminUserId: challenge.adminUserId,
    membership,
    installationId: challenge.installationId,
    label: challenge.label,
    platform: challenge.platform,
    challenge,
  });
  return send(response, 201, { status: 'activated', activation }, origin);
}



async function revokeDevice(request, response, origin, deviceId) {
  const data = await db.query({
    devices: {
      $: { where: { id: deviceId }, limit: 1 },
      venue: {},
      authUser: {},
      authorizations: { activatedBy: {} },
    },
  });
  const device = data.devices[0];
  if (!device) return send(response, 404, { error: 'Device not found' }, origin);

  const venueId = linkedId(device.venue);
  const deviceUserId = linkedId(device.authUser);
  if (!venueId || !deviceUserId) throw new Error('Device is missing authorization links');
  const admin = await authorizeAdmin(request, venueId);
  const occurredAt = new Date().toISOString();
  const authorization = device.authorizations.find((candidate) => candidate.status === 'active');
  const auditEventId = randomUUID();
  const venueData = await db.query({
    venues: { $: { where: { id: venueId }, limit: 1 }, organization: {} },
  });
  const organizationId = linkedId(venueData.venues[0]?.organization);
  if (!organizationId) throw new Error('Venue is missing organization');

  await db.transact([
    db.tx.devices[deviceId].update({ status: 'revoked', revokedAt: occurredAt }),
    ...(authorization
      ? [db.tx.deviceAuthorizations[authorization.id].update({ status: 'revoked', revokedAt: occurredAt })]
      : []),
    db.tx.venues[venueId]
      .unlink({ activeDeviceUsers: [deviceUserId] }),
    db.tx.venues[venueId]
      .unlink({ ownerUsers: [deviceUserId] }),
    db.tx.venues[venueId]
      .unlink({ managerUsers: [deviceUserId] }),
    db.tx.auditEvents[auditEventId]
      .update({ venueId, action: 'device_revoked', occurredAt, metadata: { deviceId, venueId } })
      .link({ organization: organizationId, venue: venueId, device: deviceId, adminUser: admin.id }),
  ]);
  await db.auth.signOut({ id: deviceUserId });

  return send(response, 200, { deviceId, status: 'revoked' }, origin);
}

export const server = createServer(async (request, response) => {
  const origin = originFor(request);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    });
    return response.end();
  }

  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (request.method === 'GET' && url.pathname === '/healthz') {
      return send(response, 200, { ok: true }, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/device-activation-codes') {
      return await requestDeviceActivationMagicCode(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/device-activations') {
      return await beginDeviceActivation(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/device-activations/complete') {
      return await completeDeviceActivation(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/admin/warehouse-commands') {
      return await executeAdminWarehouseCommand(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/admin/staff-commands') {
      return await executeAdminStaffCommand(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/admin/operational-commands') {
      return await executeAdminOperationalCommand(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/admin/analytics/rebuild') {
      return await rebuildAdminAnalytics(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/pos/unlock-attempts') {
      return await recordPosUnlockAttempts(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/pos/orders') {
      return await createPosOrder(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/pos/shifts/open') {
      return await openPosShift(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/pos/shifts/close') {
      return await closePosShift(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/pos/cash-movements') {
      return await createCashMovement(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/pos/orders/pay') {
      return await payPosOrder(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/pos/orders/refund') {
      return await refundPosOrder(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/pos/orders/refund/cancel') {
      return await cancelPosRefund(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/pos/orders/update') {
      return await updatePosOrder(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/pos/orders/cancel') {
      return await cancelPosOrder(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/pos/order-lines/remove') {
      return await removePosOrderLine(request, response, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/pos/order-lines') {
      return await addPosOrderLine(request, response, origin);
    }
    const revokedDevice = /^\/v1\/devices\/([0-9a-f-]{36})\/revoke$/i.exec(url.pathname);
    if (request.method === 'POST' && revokedDevice) {
      return await revokeDevice(request, response, origin, revokedDevice[1]);
    }
    return send(response, 404, { error: 'Not found' }, origin);
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
    return send(response, status, {
      error: error instanceof Error ? error.message : 'Request failed',
      ...(typeof error?.code === 'string' ? { code: error.code } : {}),
      retryable: status >= 500,
      ...(error?.details === undefined ? {} : { details: error.details }),
    }, origin);
  }
});

server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Activation worker listening on ${PORT}`);
});
