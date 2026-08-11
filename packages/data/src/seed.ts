import { init } from '@instantdb/admin';
import schema, { type AppSchema } from './instant.schema.js';
import {
  deriveEmployeePinVerifier,
  employeePinLookupHash,
  EMPLOYEE_PIN_CREDENTIAL_TTL_MS,
} from './pinCredentials.js';
import { deterministicId, TEST_VENUE_IDS as IDS } from './ids.js';

const appId = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_ADMIN_TOKEN;

if (!appId || !adminToken) {
  throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required to seed InstantDB');
}

const db = init<AppSchema>({ appId, adminToken, schema });
const createdAt = '2026-07-30T08:00:00.000Z';

// ── Auth users ─────────────────────────────────────────────────

const ownerEmail = 'owner@alto-coffee.test';
await db.auth.createToken({ email: ownerEmail });
const owner = await db.auth.getUser({ email: ownerEmail });
if (!owner) throw new Error('Could not create the seeded owner');

const managerEmail = 'manager@alto-coffee.test';
await db.auth.createToken({ email: managerEmail });
const manager = await db.auth.getUser({ email: managerEmail });
if (!manager) throw new Error('Could not create the seeded manager');

const deviceUser1Email = 'tablet-1@alto-coffee.test';
await db.auth.createToken({ email: deviceUser1Email });
const deviceUser1 = await db.auth.getUser({ email: deviceUser1Email });
if (!deviceUser1) throw new Error('Could not create device user 1');

const deviceUser2Email = 'tablet-2@alto-coffee.test';
await db.auth.createToken({ email: deviceUser2Email });
const deviceUser2 = await db.auth.getUser({ email: deviceUser2Email });
if (!deviceUser2) throw new Error('Could not create device user 2');

// ── Clean legacy operational fixture ───────────────────────────
//
// Development fixture IDs are stable. Remove the pre-command history before
// recreating the fixture so schema migrations never need to preserve records
// that violate the current production invariants.
const integrationCashMovementId = deterministicId('cash-movement', IDS.integrationOrder);
const integrationInventoryMovementId = deterministicId(
  'inventory-movement',
  IDS.integrationOrder,
  IDS.integrationOrderItem,
  IDS.productCoffeeBeans,
  'sale',
);

await db.transact([
  db.tx.orderEvents[deterministicId('order-event', IDS.integrationOrder, 'created')].delete(),
  db.tx.orderEvents[deterministicId('order-event', IDS.integrationOrderItem, 'item_added')].delete(),
  db.tx.orderEvents[deterministicId('order-event', IDS.integrationPayment, 'paid')].delete(),
  db.tx.fiscalReceipts[IDS.integrationOrder].delete(),
  db.tx.cashMovements[integrationCashMovementId].delete(),
  db.tx.payments[IDS.integrationOrder].delete(),
  db.tx.kitchenTickets[IDS.integrationTicket].delete(),
  db.tx.inventoryMovements[integrationInventoryMovementId].delete(),
  db.tx.orderItems[IDS.integrationOrderItem].delete(),
  db.tx.orders[IDS.integrationOrder].delete(),
  db.tx.shifts[IDS.integrationShift].delete(),
  db.tx.fiscalReceipts[IDS.fiscalReceiptPaid].delete(),
  db.tx.cashMovements[IDS.cashMovementPaid].delete(),
  db.tx.payments[IDS.paymentPaidCash].delete(),
  db.tx.kitchenTickets[IDS.ticketActive].delete(),
  db.tx.kitchenTickets[IDS.ticketPaid].delete(),
  db.tx.inventoryMovements[IDS.inventoryCoffeePaid].delete(),
  db.tx.inventoryMovements[IDS.inventoryMilkPaid].delete(),
  db.tx.inventoryMovements[IDS.inventoryCoffeeOpening].delete(),
  db.tx.inventoryMovements[IDS.inventoryMilkOpening].delete(),
  db.tx.orderItems[IDS.orderActiveItem].delete(),
  db.tx.orderItems[IDS.orderPaidItem1].delete(),
  db.tx.orderItems[IDS.orderPaidItem2].delete(),
  db.tx.orders[IDS.orderActive].delete(),
  db.tx.orders[IDS.orderPaid].delete(),
  db.tx.shifts[IDS.shiftOpen].delete(),
]);

// ── Tenancy ────────────────────────────────────────────────────

const org = IDS.organization;
const venue = IDS.venue;

await db.transact([
  db.tx.organizations[org].update({ slug: 'alto-coffee', name: 'Alto Coffee', createdAt }),
  db.tx.venues[venue]
    .update({ slug: 'alto-coffee-bishkek', name: 'Alto Coffee Bishkek', currency: 'KGS', timeZone: 'Asia/Bishkek', venueType: 'restaurant', trackGuests: false, createdAt, version: 0 })
    .link({ organization: org }),
  // Owner membership + authorization links
  db.tx.memberships[IDS.membershipOwner]
    .update({ role: 'owner', status: 'active', createdAt })
    .link({ organization: org, venue, user: owner.id }),
  db.tx.venues[venue].link({ ownerUsers: [owner.id], activeDeviceUsers: [owner.id] }),
  // Manager membership + authorization links
  db.tx.memberships[IDS.membershipManager]
    .update({ role: 'manager', status: 'active', createdAt })
    .link({ organization: org, venue, user: manager.id }),
  db.tx.venues[venue].link({ managerUsers: [manager.id], activeDeviceUsers: [manager.id] }),
]);

// ── Employees ──────────────────────────────────────────────────

const pinUpdatedAt = new Date().toISOString();
const pinExpiresAt = new Date(Date.parse(pinUpdatedAt) + EMPLOYEE_PIN_CREDENTIAL_TTL_MS).toISOString();
const waiterPin = '123456';
const cashierPin = '432198';
const waiterPinSalt = IDS.employeePinWaiter.replaceAll('-', '');
const cashierPinSalt = IDS.employeePinCashier.replaceAll('-', '');
const waiterPinVerifier = await deriveEmployeePinVerifier(waiterPin, waiterPinSalt);
const cashierPinVerifier = await deriveEmployeePinVerifier(cashierPin, cashierPinSalt);
await db.transact([
  db.tx.employees[IDS.employeeWaiter]
    .update({ venueId: venue, displayName: 'Айжан', role: 'waiter', status: 'active', createdAt })
    .link({ venue }),
  db.tx.employeePinCredentials[IDS.employeePinWaiter]
    .update({
      pinSalt: waiterPinSalt,
      pinVerifier: waiterPinVerifier,
      pinLookupHash: employeePinLookupHash(venue, waiterPin),
      credentialsVersion: 1,
      expiresAt: pinExpiresAt,
      updatedAt: pinUpdatedAt,
    })
    .link({ employee: IDS.employeeWaiter }),
  db.tx.employees[IDS.employeeCashier]
    .update({ venueId: venue, displayName: 'Эрмек', role: 'cashier', status: 'active', createdAt })
    .link({ venue }),
  db.tx.employeePinCredentials[IDS.employeePinCashier]
    .update({
      pinSalt: cashierPinSalt,
      pinVerifier: cashierPinVerifier,
      pinLookupHash: employeePinLookupHash(venue, cashierPin),
      credentialsVersion: 1,
      expiresAt: pinExpiresAt,
      updatedAt: pinUpdatedAt,
    })
    .link({ employee: IDS.employeeCashier }),
]);

// ── Devices ────────────────────────────────────────────────────

await db.transact([
  db.tx.devices[IDS.deviceTablet1]
    .update({ installationId: 'development-tablet-1', label: 'Планшет зала', platform: 'ios', status: 'active', createdAt })
    .link({ venue, authUser: deviceUser1.id }),
  db.tx.deviceAuthorizations[IDS.deviceAuthTablet1]
    .update({ status: 'active', activatedAt: createdAt })
    .link({ device: IDS.deviceTablet1, venue, activatedBy: owner.id }),
  db.tx.venues[venue].link({ activeDeviceUsers: [deviceUser1.id] }),
  db.tx.devices[IDS.deviceTablet2]
    .update({ installationId: 'development-tablet-2', label: 'Планшет бара', platform: 'ios', status: 'active', createdAt })
    .link({ venue, authUser: deviceUser2.id }),
  db.tx.deviceAuthorizations[IDS.deviceAuthTablet2]
    .update({ status: 'active', activatedAt: createdAt })
    .link({ device: IDS.deviceTablet2, venue, activatedBy: owner.id }),
  db.tx.venues[venue].link({ activeDeviceUsers: [deviceUser2.id] }),
]);

// ── Catalog ────────────────────────────────────────────────────

await db.transact([
  // Categories
  db.tx.categories[IDS.categoryCoffee].update({ venueId: venue, name: 'Кофе', color: '#4A2C2A', sortOrder: 1, status: 'active', createdAt }).link({ venue }),
  db.tx.categories[IDS.categoryTea].update({ venueId: venue, name: 'Чай', color: '#2A4A2A', sortOrder: 2, status: 'active', createdAt }).link({ venue }),
  // Dishes
  db.tx.products[IDS.productEspresso].update({ venueId: venue, name: 'Эспрессо', kind: 'dish', priceTiyin: 15000, costTiyin: 5000, unit: 'portions', sortOrder: 1, status: 'active', createdAt }).link({ venue, category: IDS.categoryCoffee }),
  db.tx.products[IDS.productLatte].update({ venueId: venue, name: 'Латте', kind: 'dish', priceTiyin: 25000, costTiyin: 9000, unit: 'portions', sortOrder: 2, status: 'active', createdAt }).link({ venue, category: IDS.categoryCoffee }),
  db.tx.products[IDS.productTea].update({ venueId: venue, name: 'Чай чёрный', kind: 'dish', priceTiyin: 8000, costTiyin: 2000, unit: 'portions', sortOrder: 1, status: 'active', createdAt }).link({ venue, category: IDS.categoryTea }),
  // Ingredients
  db.tx.products[IDS.productCoffeeBeans].update({ venueId: venue, name: 'Кофе в зёрнах', kind: 'ingredient', priceTiyin: 0, costTiyin: 50, unit: 'g', sortOrder: 1, status: 'active', createdAt }).link({ venue }),
  db.tx.products[IDS.productMilk].update({ venueId: venue, name: 'Молоко', kind: 'ingredient', priceTiyin: 0, costTiyin: 5, unit: 'ml', sortOrder: 2, status: 'active', createdAt }).link({ venue }),
  // Modifier group + modifier
  db.tx.modifierGroups[IDS.modGroupMilk].update({ venueId: venue, name: 'Молоко', maxSelect: 1, isRequired: false, sortOrder: 1, status: 'active', createdAt }).link({ venue, products: [IDS.productLatte] }),
  db.tx.modifiers[IDS.modifierOatMilk].update({ venueId: venue, name: 'Овсяное', priceTiyin: 5000, sortOrder: 1, status: 'active', createdAt }).link({ group: IDS.modGroupMilk }),
  // Recipes
  db.tx.recipeItems[IDS.recipeEspressoBeans].update({ venueId: venue, quantityMilli: 18000, unit: 'g', createdAt }).link({ dish: IDS.productEspresso, ingredient: IDS.productCoffeeBeans }),
  db.tx.recipeItems[IDS.recipeLatteBeans].update({ venueId: venue, quantityMilli: 18000, unit: 'g', createdAt }).link({ dish: IDS.productLatte, ingredient: IDS.productCoffeeBeans }),
  db.tx.recipeItems[IDS.recipeLatteMilk].update({ venueId: venue, quantityMilli: 200000, unit: 'ml', createdAt }).link({ dish: IDS.productLatte, ingredient: IDS.productMilk }),
]);

// ── Floor plan ─────────────────────────────────────────────────

await db.transact([
  db.tx.zones[IDS.zoneMain].update({ venueId: venue, name: 'Основной зал', gridCols: 8, gridRows: 6, sortOrder: 1, status: 'active', createdAt }).link({ venue }),
  db.tx.tables[IDS.table1].update({ venueId: venue, number: '1', capacity: 4, col: 0, row: 0, colSpan: 2, rowSpan: 2, size: 'square', status: 'free', createdAt, version: 0 }).link({ venue, zone: IDS.zoneMain }),
  db.tx.tables[IDS.table2].update({ venueId: venue, number: '2', capacity: 2, col: 3, row: 0, colSpan: 2, rowSpan: 2, size: 'square', status: 'free', createdAt, version: 0 }).link({ venue, zone: IDS.zoneMain }),
]);

// ── Opening inventory ──────────────────────────────────────────
//
// A clean seed starts without a shift or order. Paid/history fixtures must be
// created through the shared commands so they exercise the production flow.

await db.transact([
  db.tx.inventoryMovements[IDS.inventoryCoffeeOpening]
    .update({
      venueId: venue,
      operationId: IDS.inventoryCoffeeOpening,
      quantityDeltaMilli: 1_000_000,
      unit: 'g',
      reason: 'opening',
      lineIdempotencyKey: `${IDS.venue}:${IDS.productCoffeeBeans}:opening:seed-001`,
      occurredAt: createdAt,
      createdAt,
    })
    .link({ venue, product: IDS.productCoffeeBeans }),
  db.tx.inventoryMovements[IDS.inventoryMilkOpening]
    .update({
      venueId: venue,
      quantityDeltaMilli: 10_000_000,
      operationId: IDS.inventoryMilkOpening,
      unit: 'ml',
      reason: 'opening',
      lineIdempotencyKey: `${IDS.venue}:${IDS.productMilk}:opening:seed-001`,
      occurredAt: createdAt,
      createdAt,
    })
    .link({ venue, product: IDS.productMilk }),
]);

console.log(`Seeded Alto Coffee Bishkek (${appId}): 2 devices, 2 employees, catalog, floor plan and opening inventory`);
