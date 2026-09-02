/**
 * seed-from-poster.ts — Pull data from Poster API and create a venue in InstantDB.
 *
 * Usage:
 *   pnpm --filter @lumo/data seed:poster -- <slug> <name> <poster_account> <poster_token>
 *
 * Example:
 *   pnpm --filter @lumo/data seed:poster -- navat "Navat" navat 305185:token123
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


const slug = process.argv[2];
const name = process.argv[3];
const posterAccount = process.argv[4];
const posterToken = process.argv[5]?.trim();

if (!slug || !name || !posterAccount || !posterToken || !/^[a-z][a-z0-9-]*$/.test(slug)) {
  console.error('Usage: seed-from-poster.ts <slug> <name> <poster_account> <poster_token>');
  process.exit(1);
}

const appId = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_ADMIN_TOKEN;
if (!appId || !adminToken) {
  throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
}
const db = init<AppSchema>({ appId, adminToken, schema });

// ── IDs ───────────────────────────────────────────────────────

const NS = 'bc06127e-7f60-4e15-8498-e3f5a14f0001';
function det(kind: string, ...parts: string[]): string {
  return uuidv5([kind, ...parts].join('\u001F'), NS);
}
const VENUE_ID = det('venue', slug);
const ORG_ID = det('org', slug);

// ── Poster API ────────────────────────────────────────────────

const POSTER_BASE = `https://${posterAccount}.joinposter.com/api`;

async function poster<T>(method: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${POSTER_BASE}/${method}`);
  url.searchParams.set('token', posterToken);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Poster ${method}: ${res.status}`);
  const data = await res.json() as Record<string, unknown>;
  if (data.error) {
    const e = data.error as Record<string, unknown>;
    throw new Error(`Poster ${method} err ${e.code}: ${e.message || ''}`);
  }
  return data as T;
}

// ── Types ─────────────────────────────────────────────────────

interface PProduct {
  product_id: string; product_name: string; type: string;
  menu_category_id: string; category_name: string; sort_order: string;
  cost: string; price: Record<string, string>;
  spots: Array<{ price: string }>;
  ingredients: Array<{
    ingredient_id: string; structure_brutto: string;
    structure_netto: string; structure_unit: string;
  }>;
  out: string;
}
interface PIngredient {
  ingredient_id: string; ingredient_name: string;
  ingredient_unit: string; ingredient_left: string; prime_cost: string;
}
interface PLeftover {
  ingredient_id: string; ingredient_name: string;
  ingredient_left: string; ingredient_unit: string; prime_cost: string;
}
interface PSpot { spot_id: string; spot_name: string; spot_tables_count: string; }

// ── Units ─────────────────────────────────────────────────────

function mapUnit(u: string): string {
  const t = (u || '').trim();
  if (t === 'кг' || t === 'kg') return 'g';
  if (t === 'л' || t === 'l') return 'ml';
  if (t === 'шт' || t === 'pc' || t === 'pcs' || t === 'порц') return 'portions';
  if (t === 'г' || t === 'g') return 'g';
  if (t === 'мл' || t === 'ml') return 'ml';
  return t || 'portions';
}
function toMilli(qty: number, unit: string): number {
  const u = (unit || '').trim();
  if (u === 'кг' || u === 'kg') return qty * 1_000_000;
  if (u === 'л' || u === 'l') return qty * 1_000_000;
  if (u === 'г' || u === 'g') return qty * 1000;
  if (u === 'мл' || u === 'ml') return qty * 1000;
  return qty;
}

/**
 * Converts Poster prime_cost (kopecks per base unit) to InstantDB
 * costTiyin per gram/ml.
 *
 * Poster returns cost per kg/l for mass/volume ingredients.
 * InstantDB stores cost per g/ml for consistency with recipe items.
 */
function toUnitCost(costKopecks: number, originalUnit: string): number {
  const u = (originalUnit || '').trim();
  // If Poster priced per kg or liter, divide by 1000 to get per-g/ml cost
  if (u === 'кг' || u === 'kg' || u === 'л' || u === 'l') return Math.round(costKopecks / 1000);
  return Math.round(costKopecks);
}

// ── Fetch ─────────────────────────────────────────────────────

console.log(`Fetching Poster data for "${name}"...`);

const [prodRes, ingRes, leftRes, spotRes] = await Promise.all([
  poster<{ response: PProduct[] }>('menu.getProducts'),
  poster<{ response: PIngredient[] }>('menu.getIngredients'),
  poster<{ response: PLeftover[] }>('storage.getStorageLeftovers').catch(() => ({ response: [] as PLeftover[] })),
  poster<{ response: PSpot[] }>('access.getSpots').catch(() => ({ response: [] as PSpot[] })),
]);

const products = prodRes.response || [];
const ings = ingRes.response || [];
const leftovers = leftRes.response || [];
const spots = spotRes.response || [];
const dishes = products.filter(p => p.type === '2' && p.out !== '1');
const goods = products.filter(p => p.type === '3' && p.out !== '1');

console.log(`  ${products.length} products (${dishes.length} dishes, ${goods.length} goods)`);
console.log(`  ${ings.length} ingredients`);
console.log(`  ${leftovers.length} leftovers`);
console.log(`  ${spots.length} tables`);

// ── Categories map ────────────────────────────────────────────

const catNames = new Set<string>();
for (const p of products) {
  if (p.out !== '1') catNames.add(p.category_name || 'Без категории');
}

// ── Auth ──────────────────────────────────────────────────────

const emails = [
  `owner@${slug}.test`, `manager@${slug}.test`,
  `tablet-1@${slug}.test`, `tablet-2@${slug}.test`,
];
console.log('Creating auth users...');
for (const e of emails) await db.auth.createToken({ email: e });
const [owner, manager, d1, d2] = await Promise.all(emails.map(e => db.auth.getUser({ email: e })));
if (!owner || !manager || !d1 || !d2) throw new Error('Auth user creation failed');

const now = new Date().toISOString();
const CHUNK = 50;

// ── Tenancy ───────────────────────────────────────────────────

console.log(`Creating venue...`);
await db.transact([
  db.tx.organizations[ORG_ID].update({ slug, name, createdAt: now }),
  db.tx.venues[VENUE_ID].update({
    slug: `${slug}-main`, name, currency: 'KGS',
    timeZone: 'Asia/Bishkek', venueType: 'restaurant', trackGuests: false, createdAt: now, version: 0,
  }).link({ organization: ORG_ID }),
  db.tx.memberships[det('membership', slug, 'owner')]
    .update({ role: 'owner', status: 'active', createdAt: now })
    .link({ organization: ORG_ID, venue: VENUE_ID, user: owner.id }),
  db.tx.venues[VENUE_ID].link({ ownerUsers: [owner.id], activeDeviceUsers: [owner.id] }),
  db.tx.memberships[det('membership', slug, 'manager')]
    .update({ role: 'manager', status: 'active', createdAt: now })
    .link({ organization: ORG_ID, venue: VENUE_ID, user: manager.id }),
  db.tx.venues[VENUE_ID].link({ managerUsers: [manager.id], activeDeviceUsers: [manager.id] }),
]);

const waiterCredentialId = det('pin', slug, 'waiter');
const cashierCredentialId = det('pin', slug, 'cashier');
const waiterPin = '1234';
const cashierPin = '4321';
const pinExpiresAt = new Date(Date.parse(now) + EMPLOYEE_PIN_CREDENTIAL_TTL_MS).toISOString();
const waiterPinSalt = waiterCredentialId.replaceAll('-', '');
const cashierPinSalt = cashierCredentialId.replaceAll('-', '');
const waiterPinVerifier = await deriveEmployeePinVerifier(waiterPin, waiterPinSalt);
const cashierPinVerifier = await deriveEmployeePinVerifier(cashierPin, cashierPinSalt);
const existingPinCredentials = await db.query({
  employeePinCredentials: {
    $: { where: { id: { $in: [waiterCredentialId, cashierCredentialId] } } },
  },
});
const existingWaiterCredential = existingPinCredentials.employeePinCredentials.find(
  (row) => row.id === waiterCredentialId,
);
const existingCashierCredential = existingPinCredentials.employeePinCredentials.find(
  (row) => row.id === cashierCredentialId,
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
  db.tx.employees[det('employee', slug, 'waiter')]
    .update({ displayName: 'Официант', role: 'waiter', status: 'active', createdAt: now })
    .link({ venue: VENUE_ID }),
  db.tx.employeePinCredentials[waiterCredentialId]
    .update({
      pinSalt: waiterPinSalt,
      pinVerifier: waiterPinVerifier,
      pinLookupHash: employeePinLookupHash(VENUE_ID, waiterPin),
      credentialsVersion: waiterCredentialsVersion,
      expiresAt: pinExpiresAt,
      updatedAt: now,
    })
    .link({ employee: det('employee', slug, 'waiter') }),
  db.tx.employeePinSecrets[det('employee-pin-secret', det('employee', slug, 'waiter'))]
    .update({ pin: waiterPin, updatedAt: now })
    .link({ employee: det('employee', slug, 'waiter') }),
  db.tx.employees[det('employee', slug, 'cashier')]
    .update({ displayName: 'Кассир', role: 'cashier', status: 'active', createdAt: now })
    .link({ venue: VENUE_ID }),
  db.tx.employeePinCredentials[cashierCredentialId]
    .update({
      pinSalt: cashierPinSalt,
      pinVerifier: cashierPinVerifier,
      pinLookupHash: employeePinLookupHash(VENUE_ID, cashierPin),
      credentialsVersion: cashierCredentialsVersion,
      expiresAt: pinExpiresAt,
      updatedAt: now,
    })
    .link({ employee: det('employee', slug, 'cashier') }),
  db.tx.employeePinSecrets[det('employee-pin-secret', det('employee', slug, 'cashier'))]
    .update({ pin: cashierPin, updatedAt: now })
    .link({ employee: det('employee', slug, 'cashier') }),
]);

await db.transact([
  db.tx.devices[det('device', slug, 't1')]
    .update({ installationId: `${slug}-t1`, label: 'Планшет 1', platform: 'ios', status: 'active', createdAt: now })
    .link({ venue: VENUE_ID, authUser: d1.id }),
  db.tx.deviceAuthorizations[det('auth', slug, 't1')]
    .update({ status: 'active', activatedAt: now })
    .link({ device: det('device', slug, 't1'), venue: VENUE_ID, activatedBy: owner.id }),
  db.tx.venues[VENUE_ID].link({ activeDeviceUsers: [d1.id] }),
  db.tx.devices[det('device', slug, 't2')]
    .update({ installationId: `${slug}-t2`, label: 'Планшет 2', platform: 'ios', status: 'active', createdAt: now })
    .link({ venue: VENUE_ID, authUser: d2.id }),
  db.tx.deviceAuthorizations[det('auth', slug, 't2')]
    .update({ status: 'active', activatedAt: now })
    .link({ device: det('device', slug, 't2'), venue: VENUE_ID, activatedBy: owner.id }),
  db.tx.venues[VENUE_ID].link({ activeDeviceUsers: [d2.id] }),
]);

// ── Categories ────────────────────────────────────────────────

console.log(`Importing ${catNames.size} categories...`);
let sort = 1;
for (const c of catNames) {
  await db.transact([
    db.tx.categories[det('cat', slug, c)]
      .update({ name: c, color: '#4A2C2A', sortOrder: sort++, status: 'active', createdAt: now })
      .link({ venue: VENUE_ID }),
  ]);
}

// ── Products ──────────────────────────────────────────────────

console.log(`Importing ${dishes.length + goods.length + ings.length} products...`);


// Dishes
if (dishes.length > 0) {
  const ops = dishes.map(d => {
    const price = parseFloat(d.spots?.[0]?.price || d.price?.['1'] || '0') || 0;
    const cost = parseFloat(d.cost || '0') || 0;
    return db.tx.products[det('prod-dish', slug, d.product_id)]
      .update({
        name: d.product_name, kind: 'dish',
        priceTiyin: Math.round(price), costTiyin: Math.round(cost),
        unit: 'portions', sortOrder: parseInt(d.sort_order || '0'),
        status: 'active', createdAt: now,
      })
      .link({ venue: VENUE_ID, category: det('cat', slug, d.category_name) });
  });
  for (let i = 0; i < ops.length; i += CHUNK) await db.transact(ops.slice(i, i + CHUNK));
  console.log(`  Dishes: ${ops.length}`);
}

// Goods
if (goods.length > 0) {
  const ops = goods.map(g => {
    const cost = parseFloat(g.cost || '0') || 0;
    return db.tx.products[det('prod-good', slug, g.product_id)]
      .update({
        name: g.product_name, kind: 'ingredient',
        priceTiyin: 0, costTiyin: Math.round(cost),
        unit: 'portions', sortOrder: parseInt(g.sort_order || '0'),
        status: 'active', createdAt: now,
      })
      .link({ venue: VENUE_ID, category: det('cat', slug, g.category_name) });
  });
  for (let i = 0; i < ops.length; i += CHUNK) await db.transact(ops.slice(i, i + CHUNK));
  console.log(`  Goods: ${ops.length}`);
}

// Pure ingredients
if (ings.length > 0) {
  const ops = ings.map(ing => {
    const cost = parseFloat(ing.prime_cost || '0') || 0;
    return db.tx.products[det('prod-ingredient', slug, ing.ingredient_id)]
      .update({
        name: ing.ingredient_name, kind: 'ingredient',
        priceTiyin: 0, costTiyin: toUnitCost(cost, ing.ingredient_unit),
        unit: mapUnit(ing.ingredient_unit), sortOrder: 999,
        status: 'active', createdAt: now,
      })
      .link({ venue: VENUE_ID });
  });
  for (let i = 0; i < ops.length; i += CHUNK) await db.transact(ops.slice(i, i + CHUNK));
  console.log(`  Ingredients: ${ops.length}`);
}

// ── Recipes ───────────────────────────────────────────────────

let recipeCount = 0;
const allRecs: ReturnType<typeof db.tx.recipeItems[string]['update']>[] = [];
for (const dish of dishes) {
  for (const ing of dish.ingredients || []) {
    const netto = parseFloat(ing.structure_netto || '0');
    const brutto = parseFloat(ing.structure_brutto || '0');
    const qty = netto > 0 ? netto : brutto;
    const unit = ing.structure_unit || 'г';
    allRecs.push(
      db.tx.recipeItems[det('recipe', slug, dish.product_id, ing.ingredient_id)]
        .update({ quantityMilli: toMilli(qty, unit), unit: mapUnit(unit), createdAt: now })
        .link({ dish: det('prod-dish', slug, dish.product_id), ingredient: det('prod-ingredient', slug, ing.ingredient_id) })
    );
    recipeCount++;
  }
}
for (let i = 0; i < allRecs.length; i += CHUNK) await db.transact(allRecs.slice(i, i + CHUNK));
console.log(`  Recipes: ${recipeCount}`);

// ── Floor plan ────────────────────────────────────────────────

const tCount = spots.length || 4;
const cols = Math.max(6, Math.ceil(Math.sqrt(tCount)));
const rows = Math.max(4, Math.ceil(tCount / cols));
console.log(`Floor plan: ${cols}×${rows}`);

await db.transact([
  db.tx.zones[det('zone', slug, 'main')]
    .update({ name: 'Основной зал', gridCols: cols, gridRows: rows, sortOrder: 1, status: 'active', createdAt: now })
    .link({ venue: VENUE_ID }),
]);

for (let i = 0; i < spots.length; i += CHUNK) {
  const chunk = spots.slice(i, i + CHUNK);
  await db.transact(chunk.map((spot, j) =>
    db.tx.tables[det('table', slug, spot.spot_id)]
      .update({
        number: spot.spot_name || `${i + j + 1}`,
        capacity: parseInt(spot.spot_tables_count || '4'),
        col: (i + j) % cols, row: Math.floor((i + j) / cols),
        colSpan: 2, rowSpan: 2, size: 'square', status: 'free', createdAt: now,
      })
      .link({ venue: VENUE_ID, zone: det('zone', slug, 'main') })
  ));
}

// ── Inventory ─────────────────────────────────────────────────

let invCount = 0;
const allInv: ReturnType<typeof db.tx.inventoryMovements[string]['update']>[] = [];
for (const left of leftovers) {
  const qty = parseFloat(left.ingredient_left || '0');
  if (qty <= 0) continue;
  const unit = left.ingredient_unit || 'кг';
  const opId = det('inv', slug, left.ingredient_id, 'open');
  allInv.push(
    db.tx.inventoryMovements[opId]
      .update({
        operationId: opId, quantityDeltaMilli: toMilli(qty, unit),
        unit: mapUnit(unit), reason: 'opening',
        lineIdempotencyKey: `${VENUE_ID}:${left.ingredient_id}:opening:poster`,
        occurredAt: now, createdAt: now,
      })
      .link({ venue: VENUE_ID, product: det('prod-ingredient', slug, left.ingredient_id) })
  );
  invCount++;
}
for (let i = 0; i < allInv.length; i += CHUNK) await db.transact(allInv.slice(i, i + CHUNK));
console.log(`  Inventory: ${invCount} movements`);

// ── Done ──────────────────────────────────────────────────────

console.log('');
console.log(`✅ "${name}" (${slug}) created!`);
console.log('');
console.log(`VITE_INSTANT_APP_ID=${appId}`);
console.log(`VITE_VENUE_ID=${VENUE_ID}`);
console.log(`VITE_ORG_ID=${ORG_ID}`);
console.log(`EXPO_PUBLIC_VENUE_ID=${VENUE_ID}`);
console.log(`EXPO_PUBLIC_INSTANT_APP_ID=${appId}`);
console.log('');
console.log(`Auth: owner@${slug}.test / manager@${slug}.test`);
