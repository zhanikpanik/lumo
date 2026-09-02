import assert from 'node:assert/strict';
import { init as initAdmin } from '@instantdb/admin';
import {
  addOrderLine, createKitchenTicket, createOrder,
  deterministicId, DomainError, openShift, payOrder,
  TEST_VENUE_IDS as IDS,
} from '../index.js';
import schema, { type AppSchema } from '../instant.schema.js';

const appId = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_ADMIN_TOKEN;
if (!appId || !adminToken) throw new Error('Missing env vars');

const admin = initAdmin<AppSchema>({ appId, adminToken, schema });
const now = '2026-07-31T09:00:00.000Z';

async function expectDenied(action: string, mutation: () => Promise<unknown>) {
  try { await mutation(); assert.fail(`${action} must be denied`); }
  catch (e: any) { if (e.body?.type === 'permission-denied') return; throw e; }
}

const device = admin.asUser({ email: 'tablet-1@alto-coffee.test' });
const anonymous = admin.asUser({ guest: true });

// Unique slugs per step (orderEvents.operationId has UNIQUE constraint)
const sShift   = 'verify-shift';
const sOrder   = 'verify-order';
const sLine    = 'verify-line';
const sTicket  = 'verify-ticket';
const sPayment = 'verify-payment';

const shiftId  = deterministicId('shift', sShift);
const orderId  = deterministicId('order', sOrder);
const lineId   = deterministicId('order-item', sLine);
const ticketId = deterministicId('kitchen-ticket', sTicket);
const invMovId = deterministicId('inventory-movement', orderId, lineId, IDS.productCoffeeBeans, 'sale');
const seededDeviceData = await admin.query({
  devices: { $: { where: { id: IDS.deviceTablet1 }, limit: 1 }, authUser: {} },
});
const seededAuthLink = seededDeviceData.devices[0]?.authUser;
const seededAuthUser = Array.isArray(seededAuthLink) ? seededAuthLink[0] : seededAuthLink;
assert.ok(seededAuthUser?.id, 'seeded device auth user must exist');
const deviceAuthUserId = seededAuthUser.id;

// ── Idempotent cleanup ───────────────────────────────────
try { await admin.transact([
  admin.tx.orderEvents[deterministicId('order-event', sPayment, 'paid')].delete(),
  admin.tx.orderEvents[deterministicId('order-event', sOrder, 'created')].delete(),
  admin.tx.orderEvents[deterministicId('order-event', sLine, 'item_added')].delete(),
  admin.tx.fiscalReceipts[orderId].delete(),
  admin.tx.cashMovements[deterministicId('cash-movement', orderId)].delete(),
  admin.tx.payments[orderId].delete(),
  admin.tx.inventoryMovements[invMovId].delete(),
  admin.tx.kitchenTickets[ticketId].delete(),
  admin.tx.orderItems[lineId].delete(),
  admin.tx.orders[orderId].delete(),
  admin.tx.shifts[shiftId].delete(),
]); console.log('(cleanup)'); } catch {}

// ── Tests ────────────────────────────────────────────────

await openShift(admin, {
  operationId: sShift, venueId: IDS.venue, deviceId: IDS.deviceTablet1,
  actorEmployeeId: IDS.employeeWaiter, startingCashTiyin: 100_000, clientTimestamp: now,
}).execute(null);
console.log('✓ admin fixture: open shift');

await createOrder(admin, {
  operationId: sOrder, venueId: IDS.venue, deviceId: IDS.deviceTablet1,
  actorEmployeeId: IDS.employeeWaiter, shiftId, tableId: IDS.table1,
  tableNumber: '1', zoneName: 'Main', guestCount: 1, orderType: 'dine-in',
  isQuickCheck: false, orderNumber: 'v-1', clientTimestamp: now,
}).execute();
console.log('✓ admin fixture: create order');

const snap = { consumption: [{ ingredientId: IDS.productCoffeeBeans, quantityMilli: 18_000, unit: 'g', ingredientUnit: 'g', unitCostTiyin: 50, costTiyin: 900 }] };
await addOrderLine(admin, {
  operationId: sLine, venueId: IDS.venue, deviceId: IDS.deviceTablet1,
  actorEmployeeId: IDS.employeeWaiter, orderId, productId: IDS.productEspresso,
  productName: 'Espresso', productPriceTiyin: 15_000, quantity: 1,
  guestNumber: 1, consumptionSnapshot: snap, clientTimestamp: now,
}, { id: orderId, status: 'active', totalAmountTiyin: 0 }).execute();
console.log('✓ admin fixture: add order line');

await createKitchenTicket(admin, {
  operationId: sTicket, venueId: IDS.venue, orderId,
  deviceId: IDS.deviceTablet1, actorEmployeeId: IDS.employeeWaiter,
  sequence: 1, kind: 'initial', orderItemIds: [lineId],
  lines: [{ name: 'Espresso', quantity: 1, modifiers: [], comment: undefined }],
  clientTimestamp: now,
}).execute();
console.log('✓ admin fixture: create kitchen ticket');
await expectDenied('creating an order directly', () =>
  device.transact(device.tx.orders[deterministicId('order', 'direct-write')].update({
    venueId: IDS.venue, operationId: 'direct-write', number: 'forbidden', status: 'active',
    guestCount: 1, orderType: 'dine-in', isQuickCheck: false, openedAt: now, totalAmountTiyin: 0, source: 'pos', createdAt: now,
    version: 0,
  }).link({ venue: IDS.venue, device: IDS.deviceTablet1 })));
console.log('✓ deny: direct order creation');

const payment = await payOrder(admin, {
  operationId: sPayment, venueId: IDS.venue, shiftId, orderId,
  deviceId: IDS.deviceTablet1, actorEmployeeId: IDS.employeeWaiter,
  method: 'cash', tenderedCashTiyin: 20_000, clientTimestamp: now,
}, { id: orderId, status: 'active', totalAmountTiyin: 15_000,
     items: [{ id: lineId, consumptionSnapshotJson: JSON.stringify(snap) }] }).execute();
assert.ok(!(payment instanceof DomainError), 'admin fixture payment must succeed');
console.log('✓ admin fixture: pay order');

await expectDenied('editing a paid order', () =>
  device.transact(device.tx.orders[orderId].update({ comment: 'tampered' })));
console.log('✓ deny: paid order mutation');

await expectDenied('rewriting a kitchen snapshot', () =>
  device.transact(device.tx.kitchenTickets[ticketId].update({ snapshotJson: '{}' })));
console.log('✓ deny: kitchen snapshot mutation');

await expectDenied('rewriting inventory ledger', () =>
  device.transact(device.tx.inventoryMovements[invMovId].update({ quantityDeltaMilli: 1 })));
console.log('✓ deny: inventory ledger mutation');

await expectDenied('deleting inventory ledger', () =>
  device.transact(device.tx.inventoryMovements[invMovId].delete()));
console.log('✓ deny: inventory ledger delete');

const anonymousOrders = await anonymous.query({ orders: {} });
assert.equal(anonymousOrders.orders.length, 0, 'anonymous actor must not read orders');
await expectDenied('anonymous order creation', () =>
  anonymous.transact(anonymous.tx.orders[deterministicId('order', 'anonymous-write')].update({
    venueId: IDS.venue, operationId: 'anonymous-write', number: 'forbidden', status: 'active',
    guestCount: 1, orderType: 'dine-in', isQuickCheck: false, openedAt: now,
    totalAmountTiyin: 0, source: 'pos', createdAt: now,
    version: 0,
  }).link({ venue: IDS.venue, device: IDS.deviceTablet1 })));
console.log('✓ deny: anonymous operational read and write');

// ── Adversarial tenancy and immutable-record checks ──────────────
const outsiderEmail = 'permission-outsider@alto-coffee.test';
await admin.auth.createToken({ email: outsiderEmail });
const outsider = admin.asUser({ email: outsiderEmail });
const outsiderOrders = await outsider.query({ orders: {} });
assert.equal(outsiderOrders.orders.length, 0, 'unassigned identity must not read orders');
console.log('✓ deny: unassigned identity reads no orders');

const crossOrgId = deterministicId('permission-test', 'cross-org');
const crossVenueId = deterministicId('permission-test', 'cross-venue');
const crossCategoryId = deterministicId('permission-test', 'cross-category');
const statsId = deterministicId('permission-test', 'daily-stats');
const warehouseId = deterministicId('permission-test', 'warehouse');
const directStockId = deterministicId('permission-test', 'direct-stock');
const directDeliveryId = deterministicId('permission-test', 'direct-delivery');
const directWriteOffId = deterministicId('permission-test', 'direct-write-off');
const directTransferId = deterministicId('permission-test', 'direct-transfer');
const directInventoryId = deterministicId('permission-test', 'direct-inventory');
const crossEmployeeId = deterministicId('permission-test', 'cross-employee');
const directEmployeeId = deterministicId('permission-test', 'direct-employee');
const inactiveEmployeeId = deterministicId('permission-test', 'inactive-employee');
const inactivePinSecretId = deterministicId('permission-test', 'inactive-pin-secret');
const crossPinSecretId = deterministicId('permission-test', 'cross-pin-secret');
const directPinSecretId = deterministicId('permission-test', 'direct-pin-secret');
const seededWaiterPinSecretId = deterministicId('employee-pin-secret', IDS.employeeWaiter);
await admin.transact([
  admin.tx.organizations[crossOrgId].update({
    slug: 'permission-test-cross-org',
    name: 'Permission Test Cross Org',
    createdAt: now,
  }),
  admin.tx.venues[crossVenueId]
    .update({
      slug: 'permission-test-cross-venue',
      name: 'Permission Test Cross Venue',
      currency: 'KGS',
      timeZone: 'Asia/Bishkek',
      venueType: 'restaurant',
      trackGuests: false,
      createdAt: now,
      version: 0,
    })
    .link({ organization: crossOrgId }),
  admin.tx.venueDailyStats[statsId]
    .update({
      day: '2026-07-31',
      statsKey: `${IDS.venue}:2026-07-31`,
      sourceCount: 0,
      sourceHash: 'permission-fixture',
      version: 0,
      revenueTiyin: 0,
      orderCount: 0,
      foodCostTiyin: 0,
      cashExpenseTiyin: 0,
      updatedAt: now,
      venueId: IDS.venue,
    })
    .link({ venue: IDS.venue }),
  admin.tx.warehouses[warehouseId]
    .update({ venueId: IDS.venue, name: 'Permission Warehouse', createdAt: now })
    .link({ venue: IDS.venue }),
  admin.tx.employees[directEmployeeId]
    .update({
      venueId: IDS.venue,
      displayName: 'Direct PIN Mutation Employee',
      role: 'waiter',
      status: 'active',
      createdAt: now,
      version: 0,
    })
    .link({ venue: IDS.venue }),
  admin.tx.employees[inactiveEmployeeId]
    .update({
      venueId: IDS.venue,
      displayName: 'Inactive PIN Employee',
      role: 'waiter',
      status: 'inactive',
      createdAt: now,
      version: 0,
    })
    .link({ venue: IDS.venue }),
  admin.tx.employeePinSecrets[inactivePinSecretId]
    .update({ pin: '1357', updatedAt: now })
    .link({ employee: inactiveEmployeeId }),
  admin.tx.employees[crossEmployeeId]
    .update({
      venueId: crossVenueId,
      displayName: 'Cross Venue Employee',
      role: 'waiter',
      status: 'active',
      createdAt: now,
      version: 0,
    })
    .link({ venue: crossVenueId }),
  admin.tx.employeePinSecrets[crossPinSecretId]
    .update({ pin: '9876', updatedAt: now })
    .link({ employee: crossEmployeeId }),
]);

try {
  await expectDenied('creating a record in another venue', () =>
    device.transact(
      device.tx.categories[crossCategoryId]
        .update({
          name: 'Cross-venue mutation',
          color: '#000000',
          sortOrder: 1,
          status: 'active',
          createdAt: now,
          venueId: crossVenueId,
        })
        .link({ venue: crossVenueId }),
    ));
  console.log('✓ deny: cross-venue create');

  const crossVenue = await device.query({
    venues: { $: { where: { id: crossVenueId }, limit: 1 } },
  });
  assert.equal(crossVenue.venues.length, 0, 'venue A device must not read venue B');
  console.log('✓ deny: cross-venue device read');

  const owner = admin.asUser({ email: 'owner@alto-coffee.test' });
  const ownerVenue = await owner.query({
    venues: { $: { where: { id: IDS.venue }, limit: 1 } },
  });
  assert.equal(ownerVenue.venues.length, 1, 'active owner must read their venue');
  console.log('✓ allow: active owner membership');
  const ownerPinData = await owner.query({
    employees: { $: { where: { id: IDS.employeeWaiter }, limit: 1 }, pinSecret: {} },
  });
  assert.equal(ownerPinData.employees[0]?.pinSecret?.pin, '1234', 'venue owner must read active employee PIN');
  const devicePinSecrets = await device.query({ employeePinSecrets: {} });
  assert.equal(devicePinSecrets.employeePinSecrets.length, 0, 'POS device must not read plaintext PIN secrets');
  const outsiderPinSecrets = await outsider.query({ employeePinSecrets: {} });
  assert.equal(outsiderPinSecrets.employeePinSecrets.length, 0, 'unassigned identity must not read plaintext PIN secrets');
  const crossPinSecrets = await owner.query({
    employeePinSecrets: { $: { where: { id: crossPinSecretId }, limit: 1 } },
  });
  assert.equal(crossPinSecrets.employeePinSecrets.length, 0, 'venue owner must not read another venue PIN');
  const inactivePinSecrets = await owner.query({
    employeePinSecrets: { $: { where: { id: inactivePinSecretId }, limit: 1 } },
  });
  assert.equal(inactivePinSecrets.employeePinSecrets.length, 0, 'venue owner must not read an inactive employee PIN');
  console.log('✓ PIN secret read scope: venue admins only');

  await expectDenied('creating a PIN secret directly', () =>
    owner.transact(owner.tx.employeePinSecrets[directPinSecretId]
      .update({ pin: '1111', updatedAt: now })
      .link({ employee: directEmployeeId })));
  await expectDenied('updating a PIN secret directly', () =>
    owner.transact(owner.tx.employeePinSecrets[seededWaiterPinSecretId].update({ pin: '1111' })));
  await expectDenied('deleting a PIN secret directly', () =>
    owner.transact(owner.tx.employeePinSecrets[seededWaiterPinSecretId].delete()));
  console.log('✓ deny: direct PIN secret mutations');

  await expectDenied('creating stock directly', () =>
    owner.transact(owner.tx.stockItems[directStockId]
      .update({ venueId: IDS.venue, quantityMilli: 1, unit: 'g', updatedAt: now, version: 0 })
      .link({ warehouse: warehouseId, product: IDS.productCoffeeBeans })));
  await expectDenied('creating a delivery directly', () =>
    owner.transact(owner.tx.deliveryDocuments[directDeliveryId]
      .update({
        venueId: IDS.venue, operationId: directDeliveryId, supplier: 'Direct', deliveryDate: now,
        amountTiyin: 1, status: 'draft', source: 'manual', createdAt: now, version: 0,
      })
      .link({ venue: IDS.venue, warehouse: warehouseId })));
  await expectDenied('creating a write-off directly', () =>
    owner.transact(owner.tx.writeOffDocuments[directWriteOffId]
      .update({
        venueId: IDS.venue, operationId: directWriteOffId, reasonSummary: 'Direct', writeOffDate: now,
        status: 'draft', createdByName: 'Owner', createdAt: now, version: 0,
      })
      .link({ venue: IDS.venue, warehouse: warehouseId })));
  await expectDenied('creating a transfer directly', () =>
    owner.transact(owner.tx.transferDocuments[directTransferId]
      .update({
        venueId: IDS.venue, operationId: directTransferId, transferDate: now,
        status: 'draft', createdAt: now, version: 0,
      })
      .link({ venue: IDS.venue, fromWarehouse: warehouseId, toWarehouse: warehouseId })));
  await expectDenied('creating an inventory session directly', () =>
    owner.transact(owner.tx.inventorySessions[directInventoryId]
      .update({
        venueId: IDS.venue, operationId: directInventoryId, inventoryType: 'full',
        conductedAt: now, status: 'draft', resultDeltaTiyin: 0, createdAt: now, version: 0,
      })
      .link({ venue: IDS.venue, warehouse: warehouseId })));
  console.log('✓ deny: direct warehouse stock and document mutations');

  await admin.transact(admin.tx.venues[IDS.venue].unlink({ activeDeviceUsers: [deviceAuthUserId] }));
  try {
    const revokedOrders = await device.query({ orders: {} });
    assert.equal(revokedOrders.orders.length, 0, 'revoked device must lose query access');
    await expectDenied('revoked device order mutation', () =>
      device.transact(device.tx.orders[orderId].update({ comment: 'revoked-device-write' })));
    console.log('✓ deny: revoked device query and mutation');
  } finally {
    await admin.transact(admin.tx.venues[IDS.venue].link({ activeDeviceUsers: [deviceAuthUserId] }));
  }

  const suspendedEmail = 'permission-suspended-manager@alto-coffee.test';
  await admin.auth.createToken({ email: suspendedEmail });
  const suspendedUser = await admin.auth.getUser({ email: suspendedEmail });
  assert.ok(suspendedUser, 'suspended manager fixture user must exist');
  const suspendedMembershipId = deterministicId('permission-test', 'suspended-membership');
  await admin.transact(
    admin.tx.memberships[suspendedMembershipId]
      .update({ role: 'manager', status: 'suspended', createdAt: now })
      .link({ user: suspendedUser.id, venue: IDS.venue, organization: IDS.organization }),
  );
  const suspendedManager = admin.asUser({ email: suspendedEmail });
  try {
    const suspendedVenue = await suspendedManager.query({
      venues: { $: { where: { id: IDS.venue }, limit: 1 } },
    });
    assert.equal(suspendedVenue.venues.length, 0, 'suspended manager must not read the venue');
    await admin.transact([
      admin.tx.memberships[suspendedMembershipId].update({ status: 'active' }),
      admin.tx.venues[IDS.venue].link({ managerUsers: [suspendedUser.id] }),
    ]);
    const activeVenue = await suspendedManager.query({
      venues: { $: { where: { id: IDS.venue }, limit: 1 } },
    });
    assert.equal(activeVenue.venues.length, 1, 'activated manager must read the venue');
    console.log('✓ active membership controls manager access');
  } finally {
    await admin.transact([
      admin.tx.venues[IDS.venue].unlink({ managerUsers: [suspendedUser.id] }),
      admin.tx.memberships[suspendedMembershipId].delete(),
    ]);
  }

  await expectDenied('mutating derived daily statistics', () =>
    owner.transact(owner.tx.venueDailyStats[statsId].update({ orderCount: 1 })));
  console.log('✓ deny: direct daily-stat mutation');
} finally {
  await admin.transact([
    admin.tx.employeePinSecrets[inactivePinSecretId].delete(),
    admin.tx.employees[inactiveEmployeeId].delete(),
    admin.tx.employeePinSecrets[crossPinSecretId].delete(),
    admin.tx.employees[crossEmployeeId].delete(),
    admin.tx.employees[directEmployeeId].delete(),
    admin.tx.warehouses[warehouseId].delete(),
    admin.tx.venueDailyStats[statsId].delete(),
    admin.tx.categories[crossCategoryId].delete(),
    admin.tx.venues[crossVenueId].delete(),
    admin.tx.organizations[crossOrgId].delete(),
  ]);
}

console.log('\n✅ Complete permission actor matrix passed!');
