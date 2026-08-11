/**
 * Quick seed: creates warehouses + stockItems from cached Poster data.
 * Run: npx tsx packages/data/src/seed-warehouse.ts
 */
import { init } from '@instantdb/admin';
import { deterministicId } from './ids.js';
import schema, { type AppSchema } from './instant.schema.js';
import { readFileSync } from 'fs';
import { join } from 'path';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const appId = requiredEnv('INSTANT_APP_ID');
const adminToken = requiredEnv('INSTANT_ADMIN_TOKEN');
const venueId = requiredEnv('VENUE_ID');

const db = init<AppSchema>({ appId, adminToken, schema });

const POSTER_DIR = join(import.meta.dirname, '../../apps/admin/imports');

interface PosterIngredient {
  ingredient_id: string;
  ingredient_name: string;
  unit?: string;
  prime_cost?: string;
}

async function main() {
  // Read cached Poster ingredients
  const ingsRaw = readFileSync(join(POSTER_DIR, 'poster_ingredients.json'), 'utf-8');
  const ings: PosterIngredient[] = JSON.parse(ingsRaw).response || [];

  // Read cached leftovers for stock quantities
  const leftRaw = readFileSync(join(POSTER_DIR, 'poster_leftovers.json'), 'utf-8');
  const leftovers: any[] = JSON.parse(leftRaw).response || [];

  console.log(`Ingredients: ${ings.length}, Leftovers: ${leftovers.length}`);

  // Build stock map from leftovers: ingredient_id -> quantity
  const stockMap = new Map<string, number>();
  for (const l of leftovers) {
    const current = stockMap.get(l.ingredient_id) || 0;
    stockMap.set(l.ingredient_id, current + (Number(l.amount) || 0));
  }

  // Create warehouses
  const whBar = deterministicId('warehouse', venueId, 'bar');
  const whKitchen = deterministicId('warehouse', venueId, 'kitchen');

  console.log('Creating warehouses...');
  await db.transact([
    db.tx.warehouses[whBar].update({
      venueId,
      name: 'Бар',
      createdAt: new Date().toISOString(),
    }).link({ venue: venueId }),
    db.tx.warehouses[whKitchen].update({
      venueId,
      name: 'Кухня',
      createdAt: new Date().toISOString(),
    }).link({ venue: venueId }),
  ]);
  console.log(`  Bar: ${whBar}`);
  console.log(`  Kitchen: ${whKitchen}`);

  // Create stock items + link products to warehouses
  console.log('Linking products to warehouses + creating stock items...');
  const now = new Date().toISOString();

  // Map Poster ingredient_id -> InstantDB product ID
  const usedIds = new Set<string>();
  let count = 0;
  const CHUNK = 50;
  let ops: any[] = [];

  for (const ing of ings) {
    const productId = deterministicId('poster-product', ing.ingredient_id);
    if (usedIds.has(productId)) continue;
    usedIds.add(productId);

    const qty = stockMap.get(ing.ingredient_id) || 0;
    const unit = ing.unit || 'кг';
    const quantityMilli = unit === 'кг' ? qty * 1000 : unit === 'л' ? qty * 1000 : qty;

    // Assign ingredients to both warehouses for now
    const stockBarId = deterministicId('stock-item', whBar, productId);
    const stockKitchenId = deterministicId('stock-item', whKitchen, productId);

    ops.push(
      db.tx.stockItems[stockBarId].update({
        venueId,
        quantityMilli,
        unit,
        updatedAt: now,
      }).link({ warehouse: whBar, product: productId }),

      db.tx.stockItems[stockKitchenId].update({
        venueId,
        quantityMilli,
        unit,
        updatedAt: now,
      }).link({ warehouse: whKitchen, product: productId }),

      // Link product to warehouses
      db.tx.warehouses[whBar].link({ products: productId }),
      db.tx.warehouses[whKitchen].link({ products: productId }),
    );
    count++;

    if (ops.length >= CHUNK) {
      await db.transact(ops);
      ops = [];
      console.log(`  ${count} products processed...`);
    }
  }

  if (ops.length > 0) {
    await db.transact(ops);
  }

  console.log(`✅ Done! ${count} ingredients linked to 2 warehouses`);
  console.log(`\nWarehouse URLs:`);
  console.log(`  http://localhost:5173/warehouse`);
  console.log(`  http://localhost:5173/warehouse/operations`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
