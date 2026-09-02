import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { init } from '@instantdb/admin';
import { instantSchema } from '@lumo/data';
import {
  aggregateFinancialContributions,
  contributionDay,
  projectFinancialContributionByKey,
  rebuildVenueAnalytics,
} from '../analytics-projector.mjs';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
process.env.PORT = process.env.POS_HTTP_TEST_PORT ?? '3102';


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
const deviceId = randomUUID();
const authorizationId = randomUUID();
const employeeId = randomUUID();
const productId = randomUUID();
const deviceEmail = `pos-http-${runId}@devices.invalid`;
const deviceToken = await retrySetup(() => db.auth.createToken({ email: deviceEmail }));
const deviceUser = await retrySetup(() => db.auth.getUser({ email: deviceEmail }));
if (!deviceUser) throw new Error('Could not create HTTP fixture device identity');

await retrySetup(() => db.transact([
  db.tx.organizations[organizationId].update({ slug: `pos-http-${runId}`, name: 'POS HTTP fixture', createdAt: now }),
  db.tx.venues[venueId]
    .update({
      slug: `pos-http-${runId}`, name: 'POS HTTP fixture', currency: 'KGS', timeZone: 'Asia/Bishkek',
      venueType: 'restaurant', trackGuests: false, createdAt: now, version: 0,
    })
    .link({ organization: organizationId, activeDeviceUsers: [deviceUser.id] }),
  db.tx.devices[deviceId]
    .update({ installationId: `pos-http-${runId}`, label: 'HTTP fixture', platform: 'test', status: 'active', createdAt: now })
    .link({ venue: venueId, authUser: deviceUser.id }),
  db.tx.deviceAuthorizations[authorizationId]
    .update({ status: 'active', activatedAt: now })
    .link({ device: deviceId, venue: venueId, activatedBy: deviceUser.id }),
  db.tx.employees[employeeId]
    .update({ venueId, displayName: 'HTTP Waiter', role: 'waiter', status: 'active', createdAt: now })
    .link({ venue: venueId }),
  db.tx.products[productId]
    .update({
      venueId, name: 'HTTP Coffee', kind: 'dish', priceTiyin: 25_000, costTiyin: 0,
      unit: 'portions', sortOrder: 1, status: 'active', createdAt: now,
    })
    .link({ venue: venueId }),
]));

const externalBaseUrl = process.env.POS_HTTP_BASE_URL?.replace(/\/$/, '');
const server = externalBaseUrl ? null : (await import('../server.mjs')).server;
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${process.env.PORT}`;

async function post(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${deviceToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

async function cleanup() {
  const data = await db.query({
    commandClaims: { $: { where: { 'venue.id': venueId } } },
    analyticsProjectionCheckpoints: { $: { where: { 'venue.id': venueId } } },
    venueDailyStats: { $: { where: { 'venue.id': venueId } } },
    financialContributions: { $: { where: { 'venue.id': venueId } } },
    fiscalReceipts: { $: { where: { 'venue.id': venueId } } },
    cashMovements: { $: { where: { 'venue.id': venueId } } },
    inventoryMovements: { $: { where: { 'venue.id': venueId } } },
    orderEvents: { $: { where: { 'venue.id': venueId } } },
    orderItems: { $: { where: { 'order.venue.id': venueId } } },
    payments: { $: { where: { 'venue.id': venueId } } },
    orders: { $: { where: { 'venue.id': venueId } } },
    shifts: { $: { where: { 'venue.id': venueId } } },
    commandOperations: { $: { where: { 'venue.id': venueId } } },
  });
  const deleteSteps = [
    ...data.analyticsProjectionCheckpoints.map((entity) => db.tx.analyticsProjectionCheckpoints[entity.id].delete()),
    ...data.venueDailyStats.map((entity) => db.tx.venueDailyStats[entity.id].delete()),
    ...data.financialContributions.map((entity) => db.tx.financialContributions[entity.id].delete()),
    ...data.fiscalReceipts.map((entity) => db.tx.fiscalReceipts[entity.id].delete()),
    ...data.cashMovements.map((entity) => db.tx.cashMovements[entity.id].delete()),
    ...data.inventoryMovements.map((entity) => db.tx.inventoryMovements[entity.id].delete()),
    ...data.orderEvents.map((entity) => db.tx.orderEvents[entity.id].delete()),
    ...data.orderItems.map((entity) => db.tx.orderItems[entity.id].delete()),
    ...data.payments.map((entity) => db.tx.payments[entity.id].delete()),
    ...data.commandClaims.map((entity) => db.tx.commandClaims[entity.id].delete()),
    ...data.orders.map((entity) => db.tx.orders[entity.id].delete()),
    ...data.shifts.map((entity) => db.tx.shifts[entity.id].delete()),
    ...data.commandOperations.map((entity) => db.tx.commandOperations[entity.id].delete()),
    db.tx.deviceAuthorizations[authorizationId].delete(),
    db.tx.devices[deviceId].delete(),
    db.tx.products[productId].delete(),
    db.tx.employees[employeeId].delete(),
    db.tx.venues[venueId].delete(),
    db.tx.organizations[organizationId].delete(),
  ];
  for (let offset = 0; offset < deleteSteps.length; offset += 100) {
    await db.transact(deleteSteps.slice(offset, offset + 100));
  }
  await db.auth.signOut({ id: deviceUser.id }).catch(() => {});
}

try {
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 5_000;
    const check = async () => {
      try {
        const response = await fetch(`${baseUrl}/healthz`);
        if (response.ok) return resolve();
      } catch {}
      if (Date.now() >= deadline) return reject(new Error('Worker did not become ready'));
      setTimeout(check, 50);
    };
    void check();
  });

  const openOperationId = `open-${runId}`;
  const opened = await post('/v1/pos/shifts/open', {
    operationId: openOperationId, actorEmployeeId: employeeId, startingCashTiyin: 0,
  });
  assert.equal(opened.status, 201, JSON.stringify(opened.body));
  const shiftId = opened.body.shiftId;

  const orderOperationId = `order-${runId}`;
  const created = await post('/v1/pos/orders', {
    operationId: orderOperationId, shiftId, actorEmployeeId: employeeId, orderNumber: `HTTP-${runId.slice(0, 6)}`,
    orderType: 'dine-in', guestCount: 1, isQuickCheck: true,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const orderId = created.body.orderId;

  const linePayload = {
    operationId: `line-${runId}`, orderId, productId, actorEmployeeId: employeeId,
    quantity: 1, guestNumber: 1,
  };
  const line = await post('/v1/pos/order-lines', linePayload);
  assert.equal(line.status, 201, JSON.stringify(line.body));
  const lineReplay = await post('/v1/pos/order-lines', linePayload);
  assert.deepEqual(lineReplay, line, 'line replay returns the original HTTP result');

  const quantityPayload = {
    operationId: `quantity-${runId}`,
    orderId,
    orderItemId: line.body.orderItemId,
    actorEmployeeId: employeeId,
    quantity: 3,
  };
  const updatedQuantity = await post('/v1/pos/order-lines/quantity', quantityPayload);
  assert.equal(updatedQuantity.status, 200, JSON.stringify(updatedQuantity.body));
  assert.equal(updatedQuantity.body.quantity, 3);
  assert.equal(updatedQuantity.body.newTotal, 75_000);
  const quantityReplay = await post('/v1/pos/order-lines/quantity', quantityPayload);
  assert.deepEqual(quantityReplay, updatedQuantity, 'quantity replay returns the original HTTP result');
  const updatedLine = await db.query({
    orderItems: { $: { where: { id: line.body.orderItemId }, limit: 1 } },
    orders: { $: { where: { id: orderId }, limit: 1 } },
  });
  assert.equal(updatedLine.orderItems[0].quantity, 3);
  assert.equal(updatedLine.orders[0].totalAmountTiyin, 75_000);

  const payPayload = {
    operationId: `pay-${runId}`, orderId, shiftId, actorEmployeeId: employeeId, method: 'card',
  };
  const paid = await post('/v1/pos/orders/pay', payPayload);
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  const paidReplay = await post('/v1/pos/orders/pay', payPayload);
  assert.deepEqual(paidReplay, paid, 'payment replay returns the original HTTP result');

  const refundPayload = {
    operationId: `refund-${runId}`, orderId, shiftId, actorEmployeeId: employeeId, reason: 'HTTP proof',
  };
  const refunded = await post('/v1/pos/orders/refund', refundPayload);
  assert.equal(refunded.status, 200, JSON.stringify(refunded.body));
  const refundReplay = await post('/v1/pos/orders/refund', refundPayload);
  assert.deepEqual(refundReplay, refunded, 'refund replay returns the original HTTP result');

  const secondOrder = await post('/v1/pos/orders', {
    operationId: `order-race-${runId}`, shiftId, actorEmployeeId: employeeId, orderNumber: `RACE-${runId.slice(0, 6)}`,
    orderType: 'dine-in', guestCount: 1, isQuickCheck: true,
  });
  assert.equal(secondOrder.status, 201, JSON.stringify(secondOrder.body));
  const secondOrderId = secondOrder.body.orderId;
  const secondLine = await post('/v1/pos/order-lines', {
    operationId: `line-race-${runId}`, orderId: secondOrderId, productId, actorEmployeeId: employeeId,
    quantity: 1, guestNumber: 1,
  });
  assert.equal(secondLine.status, 201, JSON.stringify(secondLine.body));

  const concurrentPayments = await Promise.all([
    post('/v1/pos/orders/pay', {
      operationId: `pay-race-a-${runId}`, orderId: secondOrderId, shiftId, actorEmployeeId: employeeId, method: 'card',
    }),
    post('/v1/pos/orders/pay', {
      operationId: `pay-race-b-${runId}`, orderId: secondOrderId, shiftId, actorEmployeeId: employeeId, method: 'card',
    }),
  ]);
  assert.equal(concurrentPayments.filter((response) => response.status === 200).length, 1);
  assert.equal(concurrentPayments.filter((response) => response.status === 409).length, 1);

  const verification = await db.query({
    orders: { $: { where: { id: secondOrderId }, limit: 1 }, payments: {} },
    financialContributions: { $: { where: { 'order.id': secondOrderId } } },
  });
  assert.equal(verification.orders[0]?.payments.filter((payment) => payment.method !== 'refund').length, 1);
  assert.equal(verification.financialContributions.filter((entry) => entry.kind === 'sale').length, 1);

  const lineRaceOrder = await post('/v1/pos/orders', {
    operationId: `order-line-race-${runId}`, shiftId, actorEmployeeId: employeeId,
    orderNumber: `LINE-RACE-${runId.slice(0, 6)}`, orderType: 'dine-in', guestCount: 1, isQuickCheck: true,
  });
  assert.equal(lineRaceOrder.status, 201, JSON.stringify(lineRaceOrder.body));
  const lineRaceOrderId = lineRaceOrder.body.orderId;
  const concurrentLines = await Promise.all([
    post('/v1/pos/order-lines', {
      operationId: `line-race-a-${runId}`, orderId: lineRaceOrderId, productId,
      actorEmployeeId: employeeId, quantity: 1, guestNumber: 1,
    }),
    post('/v1/pos/order-lines', {
      operationId: `line-race-b-${runId}`, orderId: lineRaceOrderId, productId,
      actorEmployeeId: employeeId, quantity: 1, guestNumber: 1,
    }),
  ]);
  const acceptedLineCount = concurrentLines.filter((response) => response.status === 201).length;
  assert.ok(acceptedLineCount === 1 || acceptedLineCount === 2);
  assert.ok(concurrentLines.every((response) => response.status === 201 || response.status === 409));
  const lineRaceState = await db.query({
    orders: { $: { where: { id: lineRaceOrderId }, limit: 1 }, items: {} },
  });
  assert.equal(lineRaceState.orders[0]?.items.length, acceptedLineCount);
  assert.equal(lineRaceState.orders[0]?.totalAmountTiyin, acceptedLineCount * 25_000);
  const transitionOrder = await post('/v1/pos/orders', {
    operationId: `order-transition-${runId}`, shiftId, actorEmployeeId: employeeId,
    orderNumber: `TRANSITION-${runId.slice(0, 6)}`, orderType: 'dine-in', guestCount: 1, isQuickCheck: true,
  });
  assert.equal(transitionOrder.status, 201, JSON.stringify(transitionOrder.body));
  const transitionOrderId = transitionOrder.body.orderId;
  const transitionLine = await post('/v1/pos/order-lines', {
    operationId: `line-transition-${runId}`, orderId: transitionOrderId, productId,
    actorEmployeeId: employeeId, quantity: 1, guestNumber: 1,
  });
  assert.equal(transitionLine.status, 201, JSON.stringify(transitionLine.body));

  const paymentVersusClose = await Promise.all([
    post('/v1/pos/orders/pay', {
      operationId: `pay-transition-${runId}`, orderId: transitionOrderId,
      shiftId, actorEmployeeId: employeeId, method: 'card',
    }),
    post('/v1/pos/shifts/close', {
      operationId: `close-transition-${runId}`, shiftId, countedCashTiyin: 0,
    }),
  ]);
  assert.equal(paymentVersusClose.filter((response) => response.status === 200).length, 1);
  assert.equal(paymentVersusClose.filter((response) => response.status === 409).length, 1);

  const transitionState = await db.query({
    orders: { $: { where: { id: transitionOrderId }, limit: 1 }, payments: {} },
    shifts: { $: { where: { id: shiftId }, limit: 1 } },
  });
  const paymentWon = paymentVersusClose[0].status === 200;
  assert.equal(transitionState.orders[0]?.status, paymentWon ? 'paid' : 'active');
  assert.equal(transitionState.shifts[0]?.status, paymentWon ? 'open' : 'closed');
  assert.equal(
    transitionState.orders[0]?.payments.filter((payment) => payment.method !== 'refund').length,
    paymentWon ? 1 : 0,
  );

  const projectionDeadline = Date.now() + 15_000;
  let projectionState;
  while (Date.now() < projectionDeadline) {
    projectionState = await db.query({
      venues: { $: { where: { id: venueId }, limit: 1 } },
      financialContributions: {
        $: { where: { 'venue.id': venueId }, order: { occurredAt: 'asc' }, limit: 1_000 },
      },
      analyticsProjectionCheckpoints: { $: { where: { 'venue.id': venueId }, limit: 1_000 } },
      venueDailyStats: { $: { where: { 'venue.id': venueId }, order: { day: 'asc' }, limit: 1_000 } },
    });
    if (
      projectionState.financialContributions.length > 0
      && projectionState.analyticsProjectionCheckpoints.length === projectionState.financialContributions.length
    ) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(
    projectionState.analyticsProjectionCheckpoints.length,
    projectionState.financialContributions.length,
    'every committed financial contribution must reach the detached projection',
  );
  const timeZone = projectionState.venues[0].timeZone;
  const contributionsByDay = new Map();
  for (const contribution of projectionState.financialContributions) {
    const day = contributionDay(contribution.occurredAt, timeZone);
    const rows = contributionsByDay.get(day) ?? [];
    rows.push(contribution);
    contributionsByDay.set(day, rows);
  }
  for (const [day, contributions] of contributionsByDay) {
    const expected = aggregateFinancialContributions(contributions);
    const stats = projectionState.venueDailyStats.find((candidate) => candidate.day === day);
    assert.ok(stats, `analytics projection must contain ${day}`);
    assert.deepEqual(
      {
        revenueTiyin: stats.revenueTiyin,
        orderCount: stats.orderCount,
        foodCostTiyin: stats.foodCostTiyin,
        cashExpenseTiyin: stats.cashExpenseTiyin,
        sourceCount: stats.sourceCount,
        sourceHash: stats.sourceHash,
      },
      expected,
    );
  }
  const sampleContribution = projectionState.financialContributions[0];
  const statsBeforeReplay = JSON.stringify(projectionState.venueDailyStats);
  await projectFinancialContributionByKey(db, venueId, sampleContribution.contributionKey);
  await projectFinancialContributionByKey(db, venueId, sampleContribution.contributionKey);
  const replayedStats = await db.query({
    venueDailyStats: { $: { where: { 'venue.id': venueId }, order: { day: 'asc' }, limit: 1_000 } },
  });
  assert.equal(JSON.stringify(replayedStats.venueDailyStats), statsBeforeReplay, 'replay must not double daily statistics');
  const firstRebuild = await rebuildVenueAnalytics(db, venueId, `pos-http-${runId}-first`);
  const secondRebuild = await rebuildVenueAnalytics(db, venueId, `pos-http-${runId}-second`);
  assert.equal(secondRebuild.sourceHash, firstRebuild.sourceHash, 'complete rebuild must be deterministic');

  console.log('Verified worker HTTP shift, order, line, payment, replay, refund replay, and concurrent payment behavior.');
} finally {
  if (server?.listening) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  await cleanup();
}
