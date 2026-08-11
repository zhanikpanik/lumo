#!/usr/bin/env npx tsx
/**
 * Import live data from Poster POS into InstantDB.
 *
 * Usage:
 *   INSTANT_APP_ID=… INSTANT_ADMIN_TOKEN=… POSTER_TOKEN=… npx tsx src/import-poster.ts [phase…]
 *
 * Phases: categories, products, recipes, employees, shifts, all (default)
 *
 * Uses deterministic IDs (poster-{kind}-{posterId}) so re-runs are idempotent.
 */

import { init } from '@instantdb/admin';
import schema, { type AppSchema } from './instant.schema.js';
import { deterministicId } from './ids.js';

// ── Config ──────────────────────────────────────────────────

const appId = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_ADMIN_TOKEN;
const posterToken = process.env.POSTER_TOKEN;
const venueId = process.env.POSTER_VENUE_ID ?? process.env.VENUE_ID;

if (!appId || !adminToken) {
  throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
}
if (!posterToken) {
  throw new Error('POSTER_TOKEN is required (Poster API token)');
}
if (!venueId) {
  throw new Error('POSTER_VENUE_ID or VENUE_ID is required');
}

const db = init<AppSchema>({ appId, adminToken, schema });
const now = new Date().toISOString();

// ── Poster API helpers ──────────────────────────────────────

const POSTER_API = 'https://joinposter.com/api';

async function posterGet<T = unknown>(method: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams({ token: posterToken!, ...params });
  const url = `${POSTER_API}/${method}?${query}`;
  console.log(`  → GET ${method}`);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Poster API ${method} failed: ${res.status} ${body}`);
  }
  const json: Record<string, unknown> = await res.json();
  return (json.response ?? json) as T;
}

// Deterministic InstantDB ID from Poster entity kind + Poster numeric ID
function posterId(kind: string, posterNumericId: string | number): string {
  return deterministicId(`poster-${kind}`, String(posterNumericId));
}

// ── Poster types (subset) ───────────────────────────────────

interface PosterCategory {
  category_id: string;
  category_name: string;
  category_color?: string;
  category_photo?: string;
  sort?: string;
}

interface PosterProduct {
  product_id: string;
  product_name: string;
  category_id: string;
  price?: string | Record<string, string>;
  cost_price?: string;
  type: string; // 1=product, 2=dish, 3=good
  weight_flag?: string;
  visible?: string;
  sort?: string;
  modifications?: PosterModification[];
  ingredients?: PosterIngredientLink[];
}

interface PosterModification {
  modification_id: string;
  modification_name: string;
  price?: string;
  group_modification_id?: string;
  group_modification_name?: string;
  hidden?: string;
}

interface PosterIngredientLink {
  ingredient_id: string;
  ingredient_name: string;
  weight?: string;
  unit?: string;
}

interface PosterIngredient {
  ingredient_id: string;
  ingredient_name: string;
  ingredient_unit?: string;
  ingredient_cost?: string;
  ingredient_photo?: string;
}

interface PosterEmployee {
  user_id: string;
  firstname: string;
  lastname?: string;
  role_id?: string;
  role_name?: string;
  phone?: string;
  status?: string;
}

interface PosterCashShift {
  cashshift_id: string;
  spot_id?: string;
  user_id?: string;
  opening_time?: string;
  closing_time?: string;
  opening_sum?: string;
  closing_sum?: string;
  status?: string; // 0=open, 1=closed
}

// ── Unit mapping ────────────────────────────────────────────

const UNIT_MAP: Record<string, string> = {
  'kg': 'кг', 'g': 'г', 'l': 'л', 'ml': 'мл',
  'pcs': 'шт', 'piece': 'шт', 'шт': 'шт',
};

function mapUnit(u: string | undefined): string {
  if (!u) return 'шт';
  return UNIT_MAP[u.toLowerCase()] ?? u;
}

// Parse Poster price (stored as "12345" = 123.45 som → 12345 tiyin)
// Poster stores prices in kopecks/tiyin already as strings
function parsePrice(raw: string | Record<string, string> | undefined): number {
  if (!raw) return 0;
  const val = typeof raw === 'object' ? Object.values(raw)[0] : raw;
  const n = parseInt(String(val), 10);
  return Number.isFinite(n) ? n : 0;
}

// ═══════════════════════════════════════════════════════════
// PHASE 1: Categories
// ═══════════════════════════════════════════════════════════

const DEFAULT_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0',
  '#00BCD4', '#FF5722', '#607D8B', '#795548', '#3F51B5',
];

async function importCategories(): Promise<Map<string, string>> {
  console.log('\n── Phase 1: Categories ──');
  const categories = await posterGet<PosterCategory[]>('menu.getCategories');
  console.log(`  Found ${categories.length} categories`);

  const idMap = new Map<string, string>(); // posterId → instantId

  const txOps = categories.map((cat, i) => {
    const id = posterId('category', cat.category_id);
    idMap.set(cat.category_id, id);
    return db.tx.categories[id]
      .update({
        name: cat.category_name,
        color: cat.category_color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        sortOrder: parseInt(cat.sort ?? String(i), 10),
        status: 'active',
        createdAt: now,
      })
      .link({ venue: venueId! });
  });

  if (txOps.length > 0) {
    await db.transact(txOps);
    console.log(`  ✓ Imported ${txOps.length} categories`);
  }

  return idMap;
}

// ═══════════════════════════════════════════════════════════
// PHASE 2: Products + Modifier Groups + Modifiers
// ═══════════════════════════════════════════════════════════

interface ProductImportResult {
  productIds: Map<string, string>; // posterProductId → instantId
  ingredientProductIds: Map<string, string>; // posterIngredientId → instantId (for recipe linking)
}

async function importProducts(categoryIdMap: Map<string, string>): Promise<ProductImportResult> {
  console.log('\n── Phase 2: Products + Modifiers ──');
  const products = await posterGet<PosterProduct[]>('menu.getProducts');
  console.log(`  Found ${products.length} products`);

  const productIds = new Map<string, string>();
  const ingredientProductIds = new Map<string, string>();

  // Collect all modifications grouped by group_id
  const modGroups = new Map<string, { name: string; mods: PosterModification[] }>();

  const txOps = products.map((p, sortIdx) => {
    const id = posterId('product', p.product_id);
    productIds.set(p.product_id, id);

    // Map type: Poster 1=product, 2=dish, 3=good → our kind
    let kind = 'dish';
    if (p.type === '1') kind = 'product';
    else if (p.type === '3') kind = 'ingredient';

    const links: Record<string, string> = { venue: venueId! };
    const catId = categoryIdMap.get(p.category_id);
    if (catId) links.category = catId;

    if (kind === 'ingredient') {
      ingredientProductIds.set(p.product_id, id);
    }

    // Collect modification groups
    if (p.modifications) {
      for (const mod of p.modifications) {
        const groupId = mod.group_modification_id ?? 'default';
        if (!modGroups.has(groupId)) {
          modGroups.set(groupId, {
            name: mod.group_modification_name ?? 'Модификаторы',
            mods: [],
          });
        }
        modGroups.get(groupId)!.mods.push(mod);
      }
    }

    return db.tx.products[id]
      .update({
        name: p.product_name,
        kind,
        priceTiyin: parsePrice(p.price),
        costTiyin: parsePrice(p.cost_price),
        unit: mapUnit(p.weight_flag === '1' ? 'кг' : 'шт'),
        sortOrder: sortIdx,
        status: p.visible === '0' ? 'inactive' : 'active',
        createdAt: now,
      })
      .link(links);
  });

  if (txOps.length > 0) {
    await db.transact(txOps);
    console.log(`  ✓ Imported ${txOps.length} products`);
  }

  // Modifier groups + modifiers
  let modSortIdx = 0;
  const modTxOps = [];

  for (const [groupId, group] of modGroups) {
    const groupIdInstant = posterId('mod-group', groupId);
    modTxOps.push(
      db.tx.modifierGroups[groupIdInstant]
        .update({
          name: group.name,
          maxSelect: 1,
          isRequired: false,
          sortOrder: modSortIdx++,
          status: 'active',
          createdAt: now,
        })
        .link({ venue: venueId! }),
    );

    for (const mod of group.mods) {
      const modIdInstant = posterId('modifier', mod.modification_id);
      modTxOps.push(
        db.tx.modifiers[modIdInstant]
          .update({
            name: mod.modification_name,
            priceTiyin: parsePrice(mod.price),
            sortOrder: 0,
            status: mod.hidden === '1' ? 'inactive' : 'active',
            createdAt: now,
          })
          .link({ group: groupIdInstant }),
      );
    }
  }

  // Also fetch ingredients from Poster ingredient API for recipe linking
  try {
    const ingredients = await posterGet<PosterIngredient[]>('menu.getIngredients');
    console.log(`  Found ${ingredients.length} ingredients (from ingredients API)`);

    let ingSortIdx = products.length;
    for (const ing of ingredients) {
      // Check if we already have this as a product (type=3 goods)
      if (!ingredientProductIds.has(ing.ingredient_id)) {
        const ingId = posterId('ingredient', ing.ingredient_id);
        ingredientProductIds.set(ing.ingredient_id, ingId);
        modTxOps.push(
          db.tx.products[ingId]
            .update({
              name: ing.ingredient_name,
              kind: 'ingredient',
              priceTiyin: 0,
              costTiyin: parsePrice(ing.ingredient_cost),
              unit: mapUnit(ing.ingredient_unit),
              sortOrder: ingSortIdx++,
              status: 'active',
              createdAt: now,
            })
            .link({ venue: venueId! }),
        );
      }
    }
  } catch {
    console.log('  ⚠ Could not fetch ingredients (menu.getIngredients), continuing');
  }

  if (modTxOps.length > 0) {
    await db.transact(modTxOps);
    console.log(`  ✓ Imported ${modGroups.size} modifier groups + modifiers`);
  }

  return { productIds, ingredientProductIds };
}

// ═══════════════════════════════════════════════════════════
// PHASE 3: Recipe Items (dish → ingredient links)
// ═══════════════════════════════════════════════════════════

async function importRecipes(
  productIds: Map<string, string>,
  ingredientProductIds: Map<string, string>,
) {
  console.log('\n── Phase 3: Recipe Items ──');
  const products = await posterGet<PosterProduct[]>('menu.getProducts');

  const allTxOps = [];
  let count = 0;

  for (const p of products) {
    if (p.type !== '2') continue; // only dishes have recipes
    const dishId = productIds.get(p.product_id);
    if (!dishId) continue;

    // Try to get detailed product with ingredients
    let recipeLinks: PosterIngredientLink[] = p.ingredients ?? [];
    if (recipeLinks.length === 0) {
      try {
        const detail = await posterGet<{ ingredients?: PosterIngredientLink[] }>(
          'menu.getProduct',
          { product_id: p.product_id },
        );
        recipeLinks = detail?.ingredients ?? [];
      } catch {
        // Product may not have detailed endpoint
      }
    }

    for (const ing of recipeLinks) {
      const ingProductId = ingredientProductIds.get(ing.ingredient_id);
      if (!ingProductId) {
        console.log(`  ⚠ Ingredient ${ing.ingredient_id} (${ing.ingredient_name}) not found in products, skipping`);
        continue;
      }

      const recipeId = posterId('recipe', `${p.product_id}-${ing.ingredient_id}`);
      const qtyGrams = parseFloat(ing.weight ?? '0');
      // Poster stores weight in grams, we store in milliunits (g → mg, ml → µl)
      const qtyMilli = Math.round(qtyGrams * 1000);

      allTxOps.push(
        db.tx.recipeItems[recipeId]
          .update({
            quantityMilli: qtyMilli,
            unit: mapUnit(ing.unit),
            createdAt: now,
          })
          .link({ dish: dishId, ingredient: ingProductId }),
      );
      count++;
    }
  }

  if (allTxOps.length > 0) {
    // Batch in groups of 50 to avoid transaction size limits
    for (let i = 0; i < allTxOps.length; i += 50) {
      await db.transact(allTxOps.slice(i, i + 50));
    }
    console.log(`  ✓ Imported ${count} recipe items`);
  } else {
    console.log('  No recipe items found');
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 4: Employees
// ═══════════════════════════════════════════════════════════

async function importEmployees(): Promise<Map<string, string>> {
  console.log('\n── Phase 4: Employees ──');
  const employees = await posterGet<PosterEmployee[]>('access.getEmployees');
  console.log(`  Found ${employees.length} employees`);

  const idMap = new Map<string, string>();
  const txOps = employees.map((emp) => {
    const id = posterId('employee', emp.user_id);
    idMap.set(emp.user_id, id);

    const displayName = [emp.firstname, emp.lastname].filter(Boolean).join(' ') || `Employee ${emp.user_id}`;
    let role = 'waiter';
    if (emp.role_name) {
      const r = emp.role_name.toLowerCase();
      if (r.includes('admin') || r.includes('управлен') || r.includes('директор')) role = 'manager';
      else if (r.includes('кассир') || r.includes('cashier')) role = 'cashier';
      else if (r.includes('повар') || r.includes('cook') || r.includes('кухн')) role = 'kitchen';
    }

    return db.tx.employees[id]
      .update({
        displayName,
        role,
        status: emp.status === '0' ? 'inactive' : 'active',
        createdAt: now,
      })
      .link({ venue: venueId! });
  });

  if (txOps.length > 0) {
    await db.transact(txOps);
    console.log(`  ✓ Imported ${txOps.length} employees`);
  }

  return idMap;
}

// ═══════════════════════════════════════════════════════════
// PHASE 5: Cash Shifts
// ═══════════════════════════════════════════════════════════

async function importShifts(employeeIdMap: Map<string, string>) {
  console.log('\n── Phase 5: Cash Shifts ──');

  let shifts: PosterCashShift[];
  try {
    shifts = await posterGet<PosterCashShift[]>('finance.getCashShifts');
  } catch {
    console.log('  ⚠ Could not fetch cash shifts, skipping');
    return;
  }
  console.log(`  Found ${shifts.length} cash shifts`);

  const txOps = shifts.map((shift) => {
    const id = posterId('shift', shift.cashshift_id);
    const isOpen = shift.status === '0' || !shift.closing_time;
    const employeeId = shift.user_id ? employeeIdMap.get(shift.user_id) : undefined;

    const links: Record<string, string> = { venue: venueId! };
    if (employeeId) links.openedBy = employeeId;

    return db.tx.shifts[id]
      .update({
        operationId: `poster-shift-${shift.cashshift_id}`,
        openedAt: shift.opening_time ? new Date(parseInt(shift.opening_time) * 1000).toISOString() : now,
        closedAt: shift.closing_time ? new Date(parseInt(shift.closing_time) * 1000).toISOString() : undefined,
        startingCashTiyin: parseInt(shift.opening_sum ?? '0', 10),
        countedCashTiyin: shift.closing_sum ? parseInt(shift.closing_sum, 10) : undefined,
        status: isOpen ? 'open' : 'closed',
        createdAt: shift.opening_time
          ? new Date(parseInt(shift.opening_time) * 1000).toISOString()
          : now,
        version: 0,
      })
      .link(links);
  });

  if (txOps.length > 0) {
    await db.transact(txOps);
    console.log(`  ✓ Imported ${txOps.length} shifts`);
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

const phases = process.argv.slice(2);
const runAll = phases.length === 0 || phases.includes('all');

async function main() {
  console.log(`Poster → InstantDB import`);
  console.log(`  App: ${appId}`);
  console.log(`  Venue: ${venueId}`);
  console.log(`  Poster token: ${posterToken!.slice(0, 8)}…`);
  console.log();

  let categoryIdMap: Map<string, string> | undefined;
  let productResult: ProductImportResult | undefined;
  let employeeIdMap: Map<string, string> | undefined;

  if (runAll || phases.includes('categories')) {
    categoryIdMap = await importCategories();
  }

  if (runAll || phases.includes('products')) {
    productResult = await importProducts(categoryIdMap ?? new Map());
  }

  if (runAll || phases.includes('recipes')) {
    await importRecipes(
      productResult?.productIds ?? new Map(),
      productResult?.ingredientProductIds ?? new Map(),
    );
  }

  if (runAll || phases.includes('employees')) {
    employeeIdMap = await importEmployees();
  }

  if (runAll || phases.includes('shifts')) {
    await importShifts(employeeIdMap ?? new Map());
  }

  console.log('\n✅ Import complete!');
}

main().catch((e: unknown) => {
  console.error('\n❌ Import failed:', e);
  process.exit(1);
});
