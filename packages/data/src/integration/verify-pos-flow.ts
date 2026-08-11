import assert from 'node:assert/strict';
import { init as initAdmin } from '@instantdb/admin';
import {
  addOrderLine, cancelOrder, createOrder, createKitchenTicket,
  deterministicId, DomainError, openShift, payOrder,
  TEST_VENUE_IDS as IDS,
} from '../index.js';
import schema, { type AppSchema } from '../instant.schema.js';

const appId = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_ADMIN_TOKEN;
if (!appId || !adminToken) throw new Error('Missing env vars');

const admin = initAdmin<AppSchema>({ appId, adminToken, schema });
const device = admin.asUser({ email: 'tablet-1@alto-coffee.test' });
const ts = () => new Date().toISOString();

// ── Operation slugs ──────────────────────────────────────────
const sS1='fs1', sO1='fo1', sL1='fl1', sL2='fl2', sT1='ft1', sP1='fp1';
const sC1='fc1', sO2='fo2', sL3='fl3';

const shId = deterministicId('shift', sS1);
const oId1 = deterministicId('order', sO1);
const li1 = deterministicId('order-item', sL1);
const li2 = deterministicId('order-item', sL2);
const tkId = deterministicId('kitchen-ticket', sT1);
const oId2 = deterministicId('order', sO2);
const li3 = deterministicId('order-item', sL3);

const snap = { consumption: [{ ingredientId: IDS.productCoffeeBeans, quantityMilli: 18_000, unit: 'g', ingredientUnit: 'g', unitCostTiyin: 50, costTiyin: 900 }] };
const snap2 = { consumption: [{ ingredientId: IDS.productCoffeeBeans, quantityMilli: 36_000, unit: 'g', ingredientUnit: 'g', unitCostTiyin: 50, costTiyin: 1800 }] };

// ── Cleanup ──────────────────────────────────────────────────
async function cleanup() {
  const pid1 = oId1; const pid2 = oId2;
  const rows: [string, string][] = [
    ['orderEvents', deterministicId('order-event', sP1, 'paid')],
    ['orderEvents', deterministicId('order-event', sC1, 'cancelled')],
    ['orderEvents', deterministicId('order-event', sO2, 'created')],
    ['orderEvents', deterministicId('order-event', sO1, 'created')],
    ['orderEvents', deterministicId('order-event', sL3, 'item_added')],
    ['orderEvents', deterministicId('order-event', sL2, 'item_added')],
    ['orderEvents', deterministicId('order-event', sL1, 'item_added')],
    ['fiscalReceipts', pid2], ['fiscalReceipts', pid1],
    ['cashMovements', deterministicId('cash-movement', pid2)],
    ['cashMovements', deterministicId('cash-movement', pid1)],
    ['payments', pid2], ['payments', pid1],
    ['inventoryMovements', deterministicId('inventory-movement', oId2, li3, IDS.productCoffeeBeans, 'sale')],
    ['inventoryMovements', deterministicId('inventory-movement', oId1, li2, IDS.productCoffeeBeans, 'sale')],
    ['inventoryMovements', deterministicId('inventory-movement', oId1, li1, IDS.productCoffeeBeans, 'sale')],
    ['kitchenTickets', tkId],
    ['orderItems', li3], ['orderItems', li2], ['orderItems', li1],
    ['orders', oId2], ['orders', oId1],
    ['shifts', shId],
  ];
  try { await admin.transact(rows.map(([e,id]) => (admin.tx as any)[e][id].delete())); } catch {}
}
await cleanup();

// ═══════════════════════════════════════════════════════════════
console.log('1. openShift');
// ═══════════════════════════════════════════════════════════════
await openShift(device, {
  operationId: sS1, venueId: IDS.venue, deviceId: IDS.deviceTablet1,
  actorEmployeeId: IDS.employeeWaiter, startingCashTiyin: 100_000, clientTimestamp: ts(),
}).execute(null);

const s = await admin.query({ shifts: { $: { where: { id: shId } } } });
assert.equal(s.shifts[0]?.status, 'open');
assert.equal(s.shifts[0]?.startingCashTiyin, 100_000);
console.log('   ✓ open');

// Duplicate rejected
try {
  await openShift(device, {
    operationId: 'shift-dup', venueId: IDS.venue, deviceId: IDS.deviceTablet1,
    actorEmployeeId: IDS.employeeWaiter, startingCashTiyin: 50_000, clientTimestamp: ts(),
  }).execute({ id: shId, status: 'open' });
  assert.fail('must reject');
} catch (e: any) {
  assert.ok(e instanceof DomainError);
  assert.equal(e.code, 'shift_already_open');
}
console.log('   ✓ duplicate rejected');

// ═══════════════════════════════════════════════════════════════
console.log('2. createOrder');
// ═══════════════════════════════════════════════════════════════
const { orderId: co1 } = await createOrder(device, {
  operationId: sO1, venueId: IDS.venue, deviceId: IDS.deviceTablet1,
  actorEmployeeId: IDS.employeeWaiter, shiftId: shId,
  tableId: IDS.table1, tableNumber: '1', zoneName: 'Main',
  guestCount: 2, orderType: 'dine-in', isQuickCheck: false,
  orderNumber: '101', clientTimestamp: ts(),
}).execute();
assert.equal(co1, oId1, 'deterministic ID');
const o1 = (await admin.query({ orders: { $: { where: { id: oId1 } } } })).orders[0];
assert.equal(o1?.status, 'active');
assert.equal(o1?.totalAmountTiyin, 0);
console.log('   ✓ active, total=0');

// ═══════════════════════════════════════════════════════════════
console.log('3. addOrderLine');
// ═══════════════════════════════════════════════════════════════
await addOrderLine(device, {
  operationId: sL1, venueId: IDS.venue, deviceId: IDS.deviceTablet1,
  actorEmployeeId: IDS.employeeWaiter, orderId: oId1,
  productId: IDS.productEspresso, productName: 'Espresso',
  productPriceTiyin: 15_000, quantity: 1, guestNumber: 1,
  consumptionSnapshot: snap, clientTimestamp: ts(),
}, { id: oId1, status: 'active', totalAmountTiyin: 0 }).execute();

await addOrderLine(device, {
  operationId: sL2, venueId: IDS.venue, deviceId: IDS.deviceTablet1,
  actorEmployeeId: IDS.employeeWaiter, orderId: oId1,
  productId: IDS.productLatte, productName: 'Latte',
  productPriceTiyin: 20_000, quantity: 2, guestNumber: 2,
  consumptionSnapshot: snap2, clientTimestamp: ts(),
}, { id: oId1, status: 'active', totalAmountTiyin: 15_000 }).execute();

const o1b = (await admin.query({ orders: { $: { where: { id: oId1 } } } })).orders[0];
assert.equal(o1b?.totalAmountTiyin, 55_000, '15k + 2×20k');
console.log('   ✓ total=55000 tiyin');

// ═══════════════════════════════════════════════════════════════
console.log('4. kitchen ticket');
// ═══════════════════════════════════════════════════════════════
await createKitchenTicket(device, {
  operationId: sT1, venueId: IDS.venue, orderId: oId1,
  deviceId: IDS.deviceTablet1, actorEmployeeId: IDS.employeeWaiter,
  sequence: 1, kind: 'initial', orderItemIds: [li1, li2],
  lines: [
    { name: 'Espresso', quantity: 1, modifiers: [], comment: undefined },
    { name: 'Latte', quantity: 2, modifiers: [], comment: undefined },
  ],
  clientTimestamp: ts(),
}).execute();
const tk = (await admin.query({ kitchenTickets: { $: { where: { id: tkId } } } })).kitchenTickets[0];
assert.equal(tk?.status, 'queued');
const items = await admin.query({ orderItems: { $: { where: { order: oId1 } } } });
for (const it of items.orderItems) assert.ok(it.sentAt, 'sentAt set');
console.log('   ✓ queued, lines marked sentAt');

// ═══════════════════════════════════════════════════════════════
console.log('5. payOrder (cash)');
// ═══════════════════════════════════════════════════════════════
const pr = await payOrder(device, {
  operationId: sP1, venueId: IDS.venue, shiftId: shId,
  orderId: oId1, deviceId: IDS.deviceTablet1,
  actorEmployeeId: IDS.employeeWaiter, method: 'cash',
  tenderedCashTiyin: 60_000, clientTimestamp: ts(),
}, {
  id: oId1, status: 'active', totalAmountTiyin: 55_000,
  items: [
    { id: li1, consumptionSnapshotJson: JSON.stringify(snap) },
    { id: li2, consumptionSnapshotJson: JSON.stringify(snap2) },
  ],
}).execute();
assert.ok(!(pr instanceof DomainError));
assert.equal(pr.status, 'paid');
assert.equal(pr.changeTiyin, 5_000);
console.log('   ✓ paid, change=5000');

// ═══════════════════════════════════════════════════════════════
console.log('6. verify ledgers');
// ═══════════════════════════════════════════════════════════════
const paidO = await admin.query({ orders: { $: { where: { id: oId1 } }, payments: {}, orderEvents: {} } });
assert.equal(paidO.orders[0]?.status, 'paid');
assert.equal(paidO.orders[0]?.payments?.length, 1);
assert.equal(paidO.orders[0]?.payments?.[0]?.amountTiyin, 55_000);

const cm = await admin.query({ cashMovements: { $: { where: { payment: oId1 } } } });
assert.equal(cm.cashMovements.length, 1);
assert.equal(cm.cashMovements[0].amountTiyin, 55_000);

const im = await admin.query({ inventoryMovements: { $: { where: { order: oId1 } } } });
assert.equal(im.inventoryMovements.length, 2);

const fr = await admin.query({ fiscalReceipts: { $: { where: { payment: oId1 } } } });
assert.equal(fr.fiscalReceipts.length, 1);

const ev = paidO.orders[0]?.orderEvents?.map((e: any) => e.action).sort();
assert.deepEqual(ev, ['created', 'item_added', 'item_added', 'paid']);
console.log('   ✓ 1 payment, 1 cash, 2 inventory, 1 fiscal, 4 events');

// ═══════════════════════════════════════════════════════════════
console.log('7. paid order immutable');
// ═══════════════════════════════════════════════════════════════
try {
  await addOrderLine(device, {
    operationId: 'imm-test', venueId: IDS.venue, deviceId: IDS.deviceTablet1,
    actorEmployeeId: IDS.employeeWaiter, orderId: oId1,
    productId: IDS.productEspresso, productName: 'X', productPriceTiyin: 1,
    quantity: 1, guestNumber: 1, consumptionSnapshot: snap, clientTimestamp: ts(),
  }, { id: oId1, status: 'paid', totalAmountTiyin: 55_000 }).execute();
  assert.fail('must reject');
} catch (e: any) {
  assert.ok(e instanceof DomainError);
}
console.log('   ✓ rejected');

// ═══════════════════════════════════════════════════════════════
console.log('8. double pay rejected');
// ═══════════════════════════════════════════════════════════════
try {
  await payOrder(device, {
    operationId: sP1, venueId: IDS.venue, shiftId: shId,
    orderId: oId1, deviceId: IDS.deviceTablet1,
    actorEmployeeId: IDS.employeeWaiter, method: 'cash',
    tenderedCashTiyin: 60_000, clientTimestamp: ts(),
  }, { id: oId1, status: 'paid', totalAmountTiyin: 55_000, items: [] }).execute();
  assert.fail('must reject');
} catch (e: any) {
  assert.ok(e instanceof DomainError);
}
console.log('   ✓ rejected');

// ═══════════════════════════════════════════════════════════════
console.log('9. cancelOrder');
// ═══════════════════════════════════════════════════════════════
const { orderId: co2 } = await createOrder(device, {
  operationId: sO2, venueId: IDS.venue, deviceId: IDS.deviceTablet1,
  actorEmployeeId: IDS.employeeWaiter, shiftId: shId,
  guestCount: 1, orderType: 'dine-in', isQuickCheck: false,
  orderNumber: '102', clientTimestamp: ts(),
}).execute();
await addOrderLine(device, {
  operationId: sL3, venueId: IDS.venue, deviceId: IDS.deviceTablet1,
  actorEmployeeId: IDS.employeeWaiter, orderId: co2,
  productId: IDS.productEspresso, productName: 'Espresso',
  productPriceTiyin: 15_000, quantity: 1, guestNumber: 1,
  consumptionSnapshot: snap, clientTimestamp: ts(),
}, { id: co2, status: 'active', totalAmountTiyin: 0 }).execute();

const cr = await cancelOrder(device, {
  operationId: sC1, venueId: IDS.venue, deviceId: IDS.deviceTablet1,
  actorEmployeeId: IDS.employeeWaiter, orderId: co2,
  closeReason: 'Гость ушёл', clientTimestamp: ts(),
}, { id: co2, status: 'active' }).execute();
assert.equal(cr.status, 'cancelled');

const co = (await admin.query({ orders: { $: { where: { id: co2 } } } })).orders[0];
assert.equal(co?.status, 'cancelled');
assert.equal(co?.closeReason, 'Гость ушёл');
const cp = await admin.query({ payments: { $: { where: { order: co2 } } } });
assert.equal(cp.payments.length, 0, 'no payment');
console.log('   ✓ cancelled, no payment');

// ═══════════════════════════════════════════════════════════════
await cleanup();
console.log('\n✅ All 9 POS flow tests passed!');
