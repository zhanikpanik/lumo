/**
 * seed-client.ts — Create a new client venue in InstantDB.
 *
 * Usage:
 *   pnpm --filter @lumo/data seed:client -- <slug> [name]
 *
 * Examples:
 *   pnpm --filter @lumo/data seed:client -- navat "Navat"
 *   pnpm --filter @lumo/data seed:client -- test-cafe "Test Cafe"
 *
 * Requires INSTANT_APP_ID and INSTANT_ADMIN_TOKEN in ../../.env.local
 */

import { init } from '@instantdb/admin';
import {
  deriveEmployeePinVerifier,
  employeePinLookupHash,
  EMPLOYEE_PIN_CREDENTIAL_TTL_MS,
} from './pinCredentials.js';
import { v5 as uuidv5 } from 'uuid';
import schema, { type AppSchema } from './instant.schema.js';


// ── Args ──────────────────────────────────────────────────────

const slug = process.argv[2];
const name = process.argv[3] ?? slug;

if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug)) {
  console.error('Usage: seed-client.ts <slug> [name]');
  console.error('  slug must be lowercase kebab-case (e.g. "navat", "test-cafe")');
  process.exit(1);
}

// ── DB ────────────────────────────────────────────────────────

const appId = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_ADMIN_TOKEN;

if (!appId || !adminToken) {
  throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required. Check ../../.env.local');
}

const db = init<AppSchema>({ appId, adminToken, schema });

// ── Deterministic IDs ─────────────────────────────────────────
// Stable per slug — re-running the script is idempotent.

const NS = 'bc06127e-7f60-4e15-8498-e3f5a14f0001';
function det(kind: string, ...parts: string[]): string {
  return uuidv5([kind, ...parts].join('\u001F'), NS);
}

const IDs = {
  // Tenancy
  org:              det('org', slug),
  venue:            det('venue', slug),
  membershipOwner:  det('membership', slug, 'owner'),
  membershipMgr:    det('membership', slug, 'manager'),
  // Employees
  employeeWaiter:   det('employee', slug, 'waiter'),
  pinWaiter:        det('pin', slug, 'waiter'),
  employeeCashier:  det('employee', slug, 'cashier'),
  pinCashier:       det('pin', slug, 'cashier'),
  // Devices
  deviceTablet1:    det('device', slug, 'tablet-1'),
  deviceAuth1:      det('device-auth', slug, 'tablet-1'),
  deviceTablet2:    det('device', slug, 'tablet-2'),
  deviceAuth2:      det('device-auth', slug, 'tablet-2'),
  // Catalog
  catCoffee:        det('category', slug, 'coffee'),
  catTea:           det('category', slug, 'tea'),
  prodEspresso:     det('product', slug, 'espresso'),
  prodLatte:        det('product', slug, 'latte'),
  prodTea:          det('product', slug, 'tea'),
  ingCoffeeBeans:   det('ingredient', slug, 'coffee-beans'),
  ingMilk:          det('ingredient', slug, 'milk'),
  modGroupMilk:     det('mod-group', slug, 'milk'),
  modOatMilk:       det('modifier', slug, 'oat-milk'),
  recipeEspresso:   det('recipe', slug, 'espresso-beans'),
  recipeLatteBeans: det('recipe', slug, 'latte-beans'),
  recipeLatteMilk:  det('recipe', slug, 'latte-milk'),
  // Floor plan
  zoneMain:         det('zone', slug, 'main'),
  table1:           det('table', slug, '1'),
  table2:           det('table', slug, '2'),
  table3:           det('table', slug, '3'),
  // Inventory
  invCoffeeOpening: det('inventory', slug, 'coffee-opening'),
  invMilkOpening:   det('inventory', slug, 'milk-opening'),
};

// ── Auth users ────────────────────────────────────────────────

const ownerEmail = `owner@${slug}.test`;
const managerEmail = `manager@${slug}.test`;
const tablet1Email = `tablet-1@${slug}.test`;
const tablet2Email = `tablet-2@${slug}.test`;

console.log('Creating auth users...');
for (const email of [ownerEmail, managerEmail, tablet1Email, tablet2Email]) {
  await db.auth.createToken({ email });
}

const owner = await db.auth.getUser({ email: ownerEmail });
const manager = await db.auth.getUser({ email: managerEmail });
const deviceUser1 = await db.auth.getUser({ email: tablet1Email });
const deviceUser2 = await db.auth.getUser({ email: tablet2Email });

if (!owner || !manager || !deviceUser1 || !deviceUser2) {
  throw new Error('Failed to create auth users');
}

const now = new Date().toISOString();

// ── Tenancy ───────────────────────────────────────────────────

console.log(`Creating venue "${name}" (${slug})...`);

await db.transact([
  db.tx.organizations[IDs.org]
    .update({ slug, name, createdAt: now }),
  db.tx.venues[IDs.venue]
    .update({
      slug: `${slug}-main`,
      name,
      currency: 'KGS',
      timeZone: 'Asia/Bishkek',
      venueType: 'restaurant',
      trackGuests: false,
      createdAt: now,
      version: 0,
    })
    .link({ organization: IDs.org }),
  db.tx.memberships[IDs.membershipOwner]
    .update({ role: 'owner', status: 'active', createdAt: now })
    .link({ organization: IDs.org, venue: IDs.venue, user: owner.id }),
  db.tx.venues[IDs.venue].link({ ownerUsers: [owner.id], activeDeviceUsers: [owner.id] }),
  db.tx.memberships[IDs.membershipMgr]
    .update({ role: 'manager', status: 'active', createdAt: now })
    .link({ organization: IDs.org, venue: IDs.venue, user: manager.id }),
  db.tx.venues[IDs.venue].link({ managerUsers: [manager.id], activeDeviceUsers: [manager.id] }),
]);

// ── Employees ─────────────────────────────────────────────────

console.log('Creating employees + PIN credentials...');
const pinExpiresAt = new Date(Date.parse(now) + EMPLOYEE_PIN_CREDENTIAL_TTL_MS).toISOString();
const waiterPin = '1234';
const cashierPin = '4321';
const waiterPinSalt = IDs.pinWaiter.replaceAll('-', '');
const cashierPinSalt = IDs.pinCashier.replaceAll('-', '');
const waiterPinVerifier = await deriveEmployeePinVerifier(waiterPin, waiterPinSalt);
const cashierPinVerifier = await deriveEmployeePinVerifier(cashierPin, cashierPinSalt);
const existingPinCredentials = await db.query({
  employeePinCredentials: {
    $: { where: { id: { $in: [IDs.pinWaiter, IDs.pinCashier] } } },
  },
});
const existingWaiterCredential = existingPinCredentials.employeePinCredentials.find(
  (row) => row.id === IDs.pinWaiter,
);
const existingCashierCredential = existingPinCredentials.employeePinCredentials.find(
  (row) => row.id === IDs.pinCashier,
);
const waiterCredentialsVersion = Math.max(
  1,
  (existingWaiterCredential?.credentialsVersion ?? 0)
    + Number(existingWaiterCredential != null && existingWaiterCredential.pinVerifier !== waiterPinVerifier),
);
const cashierCredentialsVersion = Math.max(
  1,
  (existingCashierCredential?.credentialsVersion ?? 0)
    + Number(existingCashierCredential != null && existingCashierCredential.pinVerifier !== cashierPinVerifier),
);

await db.transact([
  db.tx.employees[IDs.employeeWaiter]
    .update({ displayName: 'Официант 1', role: 'waiter', status: 'active', createdAt: now })
    .link({ venue: IDs.venue }),
  db.tx.employeePinCredentials[IDs.pinWaiter]
    .update({
      pinSalt: waiterPinSalt,
      pinVerifier: waiterPinVerifier,
      pinLookupHash: employeePinLookupHash(IDs.venue, waiterPin),
      credentialsVersion: waiterCredentialsVersion,
      expiresAt: pinExpiresAt,
      updatedAt: now,
    })
    .link({ employee: IDs.employeeWaiter }),
  db.tx.employeePinSecrets[det('employee-pin-secret', IDs.employeeWaiter)]
    .update({ pin: waiterPin, updatedAt: now })
    .link({ employee: IDs.employeeWaiter }),
  db.tx.employees[IDs.employeeCashier]
    .update({ displayName: 'Кассир', role: 'cashier', status: 'active', createdAt: now })
    .link({ venue: IDs.venue }),
  db.tx.employeePinCredentials[IDs.pinCashier]
    .update({
      pinSalt: cashierPinSalt,
      pinVerifier: cashierPinVerifier,
      pinLookupHash: employeePinLookupHash(IDs.venue, cashierPin),
      credentialsVersion: cashierCredentialsVersion,
      expiresAt: pinExpiresAt,
      updatedAt: now,
    })
    .link({ employee: IDs.employeeCashier }),
  db.tx.employeePinSecrets[det('employee-pin-secret', IDs.employeeCashier)]
    .update({ pin: cashierPin, updatedAt: now })
    .link({ employee: IDs.employeeCashier }),
]);

// ── Devices ───────────────────────────────────────────────────

console.log('Creating devices...');

await db.transact([
  db.tx.devices[IDs.deviceTablet1]
    .update({ installationId: `${slug}-tablet-1`, label: 'Планшет 1', platform: 'ios', status: 'active', createdAt: now })
    .link({ venue: IDs.venue, authUser: deviceUser1.id }),
  db.tx.deviceAuthorizations[IDs.deviceAuth1]
    .update({ status: 'active', activatedAt: now })
    .link({ device: IDs.deviceTablet1, venue: IDs.venue, activatedBy: owner.id }),
  db.tx.venues[IDs.venue].link({ activeDeviceUsers: [deviceUser1.id] }),
  db.tx.devices[IDs.deviceTablet2]
    .update({ installationId: `${slug}-tablet-2`, label: 'Планшет 2', platform: 'ios', status: 'active', createdAt: now })
    .link({ venue: IDs.venue, authUser: deviceUser2.id }),
  db.tx.deviceAuthorizations[IDs.deviceAuth2]
    .update({ status: 'active', activatedAt: now })
    .link({ device: IDs.deviceTablet2, venue: IDs.venue, activatedBy: owner.id }),
  db.tx.venues[IDs.venue].link({ activeDeviceUsers: [deviceUser2.id] }),
]);

// ── Catalog ───────────────────────────────────────────────────

console.log('Creating catalog (categories, dishes, ingredients, recipes)...');

await db.transact([
  db.tx.categories[IDs.catCoffee].update({ name: 'Кофе', color: '#4A2C2A', sortOrder: 1, status: 'active', createdAt: now }).link({ venue: IDs.venue }),
  db.tx.categories[IDs.catTea].update({ name: 'Чай', color: '#2A4A2A', sortOrder: 2, status: 'active', createdAt: now }).link({ venue: IDs.venue }),
  db.tx.products[IDs.prodEspresso].update({ name: 'Эспрессо', kind: 'dish', priceTiyin: 15000, costTiyin: 5000, unit: 'portions', sortOrder: 1, status: 'active', createdAt: now }).link({ venue: IDs.venue, category: IDs.catCoffee }),
  db.tx.products[IDs.prodLatte].update({ name: 'Латте', kind: 'dish', priceTiyin: 25000, costTiyin: 9000, unit: 'portions', sortOrder: 2, status: 'active', createdAt: now }).link({ venue: IDs.venue, category: IDs.catCoffee }),
  db.tx.products[IDs.prodTea].update({ name: 'Чай чёрный', kind: 'dish', priceTiyin: 8000, costTiyin: 2000, unit: 'portions', sortOrder: 1, status: 'active', createdAt: now }).link({ venue: IDs.venue, category: IDs.catTea }),
  db.tx.products[IDs.ingCoffeeBeans].update({ name: 'Кофе в зёрнах', kind: 'ingredient', priceTiyin: 0, costTiyin: 50, unit: 'g', sortOrder: 1, status: 'active', createdAt: now }).link({ venue: IDs.venue }),
  db.tx.products[IDs.ingMilk].update({ name: 'Молоко', kind: 'ingredient', priceTiyin: 0, costTiyin: 5, unit: 'ml', sortOrder: 2, status: 'active', createdAt: now }).link({ venue: IDs.venue }),
  db.tx.modifierGroups[IDs.modGroupMilk].update({ name: 'Молоко', maxSelect: 1, isRequired: false, sortOrder: 1, status: 'active', createdAt: now }).link({ venue: IDs.venue, products: [IDs.prodLatte] }),
  db.tx.modifiers[IDs.modOatMilk].update({ name: 'Овсяное', priceTiyin: 5000, sortOrder: 1, status: 'active', createdAt: now }).link({ group: IDs.modGroupMilk }),
  db.tx.recipeItems[IDs.recipeEspresso].update({ quantityMilli: 18000, unit: 'g', createdAt: now }).link({ dish: IDs.prodEspresso, ingredient: IDs.ingCoffeeBeans }),
  db.tx.recipeItems[IDs.recipeLatteBeans].update({ quantityMilli: 18000, unit: 'g', createdAt: now }).link({ dish: IDs.prodLatte, ingredient: IDs.ingCoffeeBeans }),
  db.tx.recipeItems[IDs.recipeLatteMilk].update({ quantityMilli: 200000, unit: 'ml', createdAt: now }).link({ dish: IDs.prodLatte, ingredient: IDs.ingMilk }),
]);

// ── Floor plan ────────────────────────────────────────────────

console.log('Creating floor plan...');

await db.transact([
  db.tx.zones[IDs.zoneMain].update({ name: 'Основной зал', gridCols: 8, gridRows: 6, sortOrder: 1, status: 'active', createdAt: now }).link({ venue: IDs.venue }),
  db.tx.tables[IDs.table1].update({ number: '1', capacity: 4, col: 0, row: 0, colSpan: 2, rowSpan: 2, size: 'square', status: 'free', createdAt: now, version: 0 }).link({ venue: IDs.venue, zone: IDs.zoneMain }),
  db.tx.tables[IDs.table2].update({ number: '2', capacity: 2, col: 3, row: 0, colSpan: 2, rowSpan: 2, size: 'square', status: 'free', createdAt: now, version: 0 }).link({ venue: IDs.venue, zone: IDs.zoneMain }),
  db.tx.tables[IDs.table3].update({ number: '3', capacity: 6, col: 0, row: 3, colSpan: 3, rowSpan: 2, size: 'rect', status: 'free', createdAt: now, version: 0 }).link({ venue: IDs.venue, zone: IDs.zoneMain }),
]);

// ── Opening inventory ─────────────────────────────────────────

console.log('Creating opening inventory...');

await db.transact([
  db.tx.inventoryMovements[IDs.invCoffeeOpening]
    .update({
      operationId: IDs.invCoffeeOpening,
      quantityDeltaMilli: 1_000_000,
      unit: 'g',
      reason: 'opening',
      lineIdempotencyKey: `${IDs.venue}:${IDs.ingCoffeeBeans}:opening:seed`,
      occurredAt: now,
      createdAt: now,
    })
    .link({ venue: IDs.venue, product: IDs.ingCoffeeBeans }),
  db.tx.inventoryMovements[IDs.invMilkOpening]
    .update({
      operationId: IDs.invMilkOpening,
      quantityDeltaMilli: 10_000_000,
      unit: 'ml',
      reason: 'opening',
      lineIdempotencyKey: `${IDs.venue}:${IDs.ingMilk}:opening:seed`,
      occurredAt: now,
      createdAt: now,
    })
    .link({ venue: IDs.venue, product: IDs.ingMilk }),
]);

// ── Done ──────────────────────────────────────────────────────

console.log('');
console.log(`✅ Venue "${name}" (${slug}) created!`);
console.log('');
console.log('─'.repeat(50));
console.log('Env vars:');
console.log('─'.repeat(50));
console.log(`VITE_INSTANT_APP_ID=${appId}`);
console.log(`VITE_VENUE_ID=${IDs.venue}`);
console.log(`VITE_ORG_ID=${IDs.org}`);
console.log('');
console.log('Auth users:');
console.log(`  Owner:   ${ownerEmail}`);
console.log(`  Manager: ${managerEmail}`);
console.log(`  Tablet1: ${tablet1Email}`);
console.log(`  Tablet2: ${tablet2Email}`);
console.log('');
console.log('Venue ID:');
console.log(`  ${IDs.venue}`);
