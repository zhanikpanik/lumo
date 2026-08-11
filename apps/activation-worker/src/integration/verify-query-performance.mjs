import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { init } from '@instantdb/admin';
import {
  TEST_VENUE_IDS as IDS,
  adminAllOrdersQuery,
  adminAllShiftsQuery,
  adminCashMovementsQuery,
  adminOrderDetailQuery,
  instantSchema,
} from '@lumo/data';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');

const db = init({ appId, adminToken, schema: instantSchema });
const LATENCY_BUDGET_MS = 3_000;

async function measured(name, query) {
  const startedAt = performance.now();
  const data = await db.query(query);
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  const payloadBytes = Buffer.byteLength(JSON.stringify(data));
  assert.ok(durationMs <= LATENCY_BUDGET_MS, `${name} exceeded ${LATENCY_BUDGET_MS}ms: ${durationMs}ms`);
  return { name, durationMs, payloadBytes, data };
}

const deviceFixture = await measured('device fixture lookup', {
  devices: { $: { where: { id: IDS.deviceTablet1 }, limit: 1 }, authUser: {} },
});
const deviceUser = deviceFixture.data.devices[0]?.authUser;
const deviceUserId = Array.isArray(deviceUser) ? deviceUser[0]?.id : deviceUser?.id;
assert.ok(deviceUserId, 'seeded device must have an auth user');

const authorization = await measured('device authorization lookup', {
  devices: {
    $: { where: { 'authUser.id': deviceUserId, status: 'active' }, limit: 2 },
    venue: {},
    authorizations: {},
  },
});
assert.ok(authorization.data.devices.length <= 2);

const orders = await measured('orders first page', adminAllOrdersQuery(IDS.venue, { limit: 50 }));
assert.ok(orders.data.orders.length <= 50);
assert.ok(orders.data.payments.length <= 150);
assert.ok(orders.data.orderEvents.length <= 1_000);
for (const order of orders.data.orders) {
  assert.equal(Object.hasOwn(order, 'items'), false, 'history rows must not preload item children');
  assert.equal(Object.hasOwn(order, 'payments'), false, 'history rows must not preload payment children');
  assert.equal(Object.hasOwn(order, 'orderEvents'), false, 'history rows must not preload event children');
}

const firstOrderId = orders.data.orders[0]?.id;
const detail = firstOrderId
  ? await measured('one order detail', adminOrderDetailQuery(IDS.venue, firstOrderId))
  : null;
if (detail) assert.ok(detail.data.orders.length <= 1);

const shifts = await measured('shifts first page', adminAllShiftsQuery(IDS.venue, { limit: 50 }));
assert.ok(shifts.data.shifts.length <= 50);
assert.ok(shifts.data.cashMovements.length <= 1_000);
for (const shift of shifts.data.shifts) {
  assert.equal(Object.hasOwn(shift, 'cashMovements'), false, 'shift rows must not preload movement children');
}

const cashMovements = await measured('cash movements first page', adminCashMovementsQuery(IDS.venue, { limit: 100 }));
assert.ok(cashMovements.data.cashMovements.length <= 100);

const report = [deviceFixture, authorization, orders, ...(detail ? [detail] : []), shifts, cashMovements]
  .map(({ name, durationMs, payloadBytes }) => ({ name, durationMs, payloadBytes }));
console.log(JSON.stringify({ latencyBudgetMs: LATENCY_BUDGET_MS, report }, null, 2));
