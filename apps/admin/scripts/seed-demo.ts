/**
 * Demo seed script — Alto Coffee Bishkek, 30 days of realistic data.
 *
 * Run: pnpm run seed  (or: node --import tsx/esm scripts/seed-demo.ts)
 *
 * Clears ALL venue data first via RPC, then inserts fresh demo data.
 * Uses VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from .env.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

process.stdout.write('SEED START\n');

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const VENUE_ID = '00000000-0000-0000-0000-000000000010';
const ORG_ID = '00000000-0000-0000-0000-000000000001';
const WORKSHOP_BAR_ID = '00000000-0000-0000-0000-000000005002';
const WORKSHOP_KITCHEN_ID = '00000000-0000-0000-0000-000000005001';

// ═══ UTILS ═══

/** Deterministic UUID from string name (MD5-based, like UUID v3) */
function uid(name: string): string {
  const hash = createHash('md5').update(name).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ═══ DATA DEFINITIONS ═══

interface DishDef {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  costPrice: number;
  workshop: 'bar' | 'kitchen';
}

interface IngredientDef {
  id: string;
  name: string;
  costPrice: number;
  unit: string;
  workshop: 'bar' | 'kitchen';
}

const CATEGORIES = [
  { id: uid('cat-coffee'), name: 'Кофе', color: '#4E342E', sort: 1 },
  { id: uid('cat-tea'), name: 'Чай', color: '#2E7D32', sort: 2 },
  { id: uid('cat-pastry'), name: 'Выпечка', color: '#F57F17', sort: 3 },
  { id: uid('cat-salads'), name: 'Салаты', color: '#00695C', sort: 4 },
  { id: uid('cat-drinks'), name: 'Напитки', color: '#1565C0', sort: 5 },
];

const DISHES: DishDef[] = [
  { id: uid('d-espresso'), categoryId: uid('cat-coffee'), name: 'Эспрессо', price: 150, costPrice: 22, workshop: 'bar' },
  { id: uid('d-americano'), categoryId: uid('cat-coffee'), name: 'Американо', price: 180, costPrice: 22, workshop: 'bar' },
  { id: uid('d-cappuccino'), categoryId: uid('cat-coffee'), name: 'Капучино', price: 220, costPrice: 38, workshop: 'bar' },
  { id: uid('d-latte'), categoryId: uid('cat-coffee'), name: 'Латте', price: 250, costPrice: 46, workshop: 'bar' },
  { id: uid('d-raf'), categoryId: uid('cat-coffee'), name: 'Раф', price: 280, costPrice: 57, workshop: 'bar' },
  { id: uid('d-flatwhite'), categoryId: uid('cat-coffee'), name: 'Флэт Уайт', price: 260, costPrice: 38, workshop: 'bar' },
  { id: uid('d-mokkachino'), categoryId: uid('cat-coffee'), name: 'Моккачино', price: 270, costPrice: 56, workshop: 'bar' },
  { id: uid('d-cocoa'), categoryId: uid('cat-coffee'), name: 'Какао', price: 200, costPrice: 43, workshop: 'bar' },
  { id: uid('d-green-tea'), categoryId: uid('cat-tea'), name: 'Чай зелёный', price: 120, costPrice: 4, workshop: 'bar' },
  { id: uid('d-black-tea'), categoryId: uid('cat-tea'), name: 'Чай чёрный', price: 100, costPrice: 3, workshop: 'bar' },
  { id: uid('d-croissant'), categoryId: uid('cat-pastry'), name: 'Круассан', price: 280, costPrice: 62, workshop: 'kitchen' },
  { id: uid('d-sandwich'), categoryId: uid('cat-pastry'), name: 'Сэндвич с курицей', price: 350, costPrice: 104, workshop: 'kitchen' },
  { id: uid('d-cheesecake'), categoryId: uid('cat-pastry'), name: 'Чизкейк', price: 300, costPrice: 198, workshop: 'kitchen' },
  { id: uid('d-brownie'), categoryId: uid('cat-pastry'), name: 'Брауни', price: 250, costPrice: 86, workshop: 'kitchen' },
  { id: uid('d-pancakes'), categoryId: uid('cat-pastry'), name: 'Панкейки', price: 280, costPrice: 29, workshop: 'kitchen' },
  { id: uid('d-greek-salad'), categoryId: uid('cat-salads'), name: 'Греческий салат', price: 320, costPrice: 102, workshop: 'kitchen' },
  { id: uid('d-smoothie'), categoryId: uid('cat-drinks'), name: 'Смузи', price: 280, costPrice: 56, workshop: 'bar' },
  { id: uid('d-lemonade'), categoryId: uid('cat-drinks'), name: 'Лимонад', price: 200, costPrice: 14, workshop: 'bar' },
];

const INGREDIENTS: IngredientDef[] = [
  { id: uid('ing-coffee'), name: 'Арабика зерно', costPrice: 1200, unit: 'кг', workshop: 'bar' },
  { id: uid('ing-milk'), name: 'Молоко 3.2%', costPrice: 80, unit: 'л', workshop: 'bar' },
  { id: uid('ing-cream'), name: 'Сливки 33%', costPrice: 350, unit: 'л', workshop: 'bar' },
  { id: uid('ing-chocolate'), name: 'Шоколад тёмный', costPrice: 900, unit: 'кг', workshop: 'bar' },
  { id: uid('ing-green-tea'), name: 'Чай зелёный листовой', costPrice: 800, unit: 'кг', workshop: 'bar' },
  { id: uid('ing-black-tea'), name: 'Чай чёрный листовой', costPrice: 600, unit: 'кг', workshop: 'bar' },
  { id: uid('ing-flour'), name: 'Мука пшеничная', costPrice: 60, unit: 'кг', workshop: 'kitchen' },
  { id: uid('ing-butter'), name: 'Масло сливочное', costPrice: 800, unit: 'кг', workshop: 'kitchen' },
  { id: uid('ing-eggs'), name: 'Яйца', costPrice: 15, unit: 'шт', workshop: 'kitchen' },
  { id: uid('ing-chicken'), name: 'Курица филе', costPrice: 450, unit: 'кг', workshop: 'kitchen' },
  { id: uid('ing-cream-cheese'), name: 'Сыр творожный', costPrice: 700, unit: 'кг', workshop: 'kitchen' },
  { id: uid('ing-feta'), name: 'Сыр фета', costPrice: 650, unit: 'кг', workshop: 'kitchen' },
  { id: uid('ing-tomatoes'), name: 'Помидоры', costPrice: 200, unit: 'кг', workshop: 'kitchen' },
  { id: uid('ing-cucumbers'), name: 'Огурцы', costPrice: 150, unit: 'кг', workshop: 'kitchen' },
  { id: uid('ing-iceberg'), name: 'Салат айсберг', costPrice: 300, unit: 'кг', workshop: 'kitchen' },
  { id: uid('ing-sugar'), name: 'Сахар', costPrice: 80, unit: 'кг', workshop: 'kitchen' },
  { id: uid('ing-lemon'), name: 'Лимон', costPrice: 250, unit: 'кг', workshop: 'bar' },
  { id: uid('ing-berries'), name: 'Ягоды замороженные', costPrice: 600, unit: 'кг', workshop: 'bar' },
  { id: uid('ing-banana'), name: 'Банан', costPrice: 180, unit: 'кг', workshop: 'bar' },
  { id: uid('ing-bread'), name: 'Хлеб для сэндвичей', costPrice: 40, unit: 'шт', workshop: 'kitchen' },
];

interface RecipeDef { dishId: string; ingredientId: string; quantity: number; unit: string; }

const RECIPES: RecipeDef[] = [
  { dishId: uid('d-espresso'), ingredientId: uid('ing-coffee'), quantity: 0.018, unit: 'кг' },
  { dishId: uid('d-americano'), ingredientId: uid('ing-coffee'), quantity: 0.018, unit: 'кг' },
  { dishId: uid('d-cappuccino'), ingredientId: uid('ing-coffee'), quantity: 0.018, unit: 'кг' },
  { dishId: uid('d-cappuccino'), ingredientId: uid('ing-milk'), quantity: 0.2, unit: 'л' },
  { dishId: uid('d-latte'), ingredientId: uid('ing-coffee'), quantity: 0.018, unit: 'кг' },
  { dishId: uid('d-latte'), ingredientId: uid('ing-milk'), quantity: 0.3, unit: 'л' },
  { dishId: uid('d-raf'), ingredientId: uid('ing-coffee'), quantity: 0.018, unit: 'кг' },
  { dishId: uid('d-raf'), ingredientId: uid('ing-cream'), quantity: 0.1, unit: 'л' },
  { dishId: uid('d-raf'), ingredientId: uid('ing-sugar'), quantity: 0.01, unit: 'кг' },
  { dishId: uid('d-flatwhite'), ingredientId: uid('ing-coffee'), quantity: 0.022, unit: 'кг' },
  { dishId: uid('d-flatwhite'), ingredientId: uid('ing-milk'), quantity: 0.15, unit: 'л' },
  { dishId: uid('d-mokkachino'), ingredientId: uid('ing-coffee'), quantity: 0.018, unit: 'кг' },
  { dishId: uid('d-mokkachino'), ingredientId: uid('ing-milk'), quantity: 0.2, unit: 'л' },
  { dishId: uid('d-mokkachino'), ingredientId: uid('ing-chocolate'), quantity: 0.02, unit: 'кг' },
  { dishId: uid('d-cocoa'), ingredientId: uid('ing-chocolate'), quantity: 0.025, unit: 'кг' },
  { dishId: uid('d-cocoa'), ingredientId: uid('ing-milk'), quantity: 0.25, unit: 'л' },
  { dishId: uid('d-green-tea'), ingredientId: uid('ing-green-tea'), quantity: 0.005, unit: 'кг' },
  { dishId: uid('d-black-tea'), ingredientId: uid('ing-black-tea'), quantity: 0.005, unit: 'кг' },
  { dishId: uid('d-croissant'), ingredientId: uid('ing-flour'), quantity: 0.1, unit: 'кг' },
  { dishId: uid('d-croissant'), ingredientId: uid('ing-butter'), quantity: 0.05, unit: 'кг' },
  { dishId: uid('d-croissant'), ingredientId: uid('ing-eggs'), quantity: 1, unit: 'шт' },
  { dishId: uid('d-croissant'), ingredientId: uid('ing-sugar'), quantity: 0.015, unit: 'кг' },
  { dishId: uid('d-sandwich'), ingredientId: uid('ing-bread'), quantity: 1, unit: 'шт' },
  { dishId: uid('d-sandwich'), ingredientId: uid('ing-chicken'), quantity: 0.1, unit: 'кг' },
  { dishId: uid('d-sandwich'), ingredientId: uid('ing-tomatoes'), quantity: 0.04, unit: 'кг' },
  { dishId: uid('d-sandwich'), ingredientId: uid('ing-cucumbers'), quantity: 0.03, unit: 'кг' },
  { dishId: uid('d-sandwich'), ingredientId: uid('ing-iceberg'), quantity: 0.02, unit: 'кг' },
  { dishId: uid('d-cheesecake'), ingredientId: uid('ing-cream-cheese'), quantity: 0.2, unit: 'кг' },
  { dishId: uid('d-cheesecake'), ingredientId: uid('ing-eggs'), quantity: 2, unit: 'шт' },
  { dishId: uid('d-cheesecake'), ingredientId: uid('ing-sugar'), quantity: 0.05, unit: 'кг' },
  { dishId: uid('d-cheesecake'), ingredientId: uid('ing-butter'), quantity: 0.03, unit: 'кг' },
  { dishId: uid('d-brownie'), ingredientId: uid('ing-chocolate'), quantity: 0.05, unit: 'кг' },
  { dishId: uid('d-brownie'), ingredientId: uid('ing-butter'), quantity: 0.03, unit: 'кг' },
  { dishId: uid('d-brownie'), ingredientId: uid('ing-eggs'), quantity: 1, unit: 'шт' },
  { dishId: uid('d-brownie'), ingredientId: uid('ing-flour'), quantity: 0.04, unit: 'кг' },
  { dishId: uid('d-pancakes'), ingredientId: uid('ing-flour'), quantity: 0.08, unit: 'кг' },
  { dishId: uid('d-pancakes'), ingredientId: uid('ing-milk'), quantity: 0.1, unit: 'л' },
  { dishId: uid('d-pancakes'), ingredientId: uid('ing-eggs'), quantity: 1, unit: 'шт' },
  { dishId: uid('d-pancakes'), ingredientId: uid('ing-sugar'), quantity: 0.01, unit: 'кг' },
  { dishId: uid('d-greek-salad'), ingredientId: uid('ing-feta'), quantity: 0.1, unit: 'кг' },
  { dishId: uid('d-greek-salad'), ingredientId: uid('ing-tomatoes'), quantity: 0.1, unit: 'кг' },
  { dishId: uid('d-greek-salad'), ingredientId: uid('ing-cucumbers'), quantity: 0.05, unit: 'кг' },
  { dishId: uid('d-greek-salad'), ingredientId: uid('ing-iceberg'), quantity: 0.03, unit: 'кг' },
  { dishId: uid('d-smoothie'), ingredientId: uid('ing-banana'), quantity: 0.1, unit: 'кг' },
  { dishId: uid('d-smoothie'), ingredientId: uid('ing-berries'), quantity: 0.05, unit: 'кг' },
  { dishId: uid('d-smoothie'), ingredientId: uid('ing-milk'), quantity: 0.1, unit: 'л' },
  { dishId: uid('d-lemonade'), ingredientId: uid('ing-lemon'), quantity: 0.05, unit: 'кг' },
  { dishId: uid('d-lemonade'), ingredientId: uid('ing-sugar'), quantity: 0.02, unit: 'кг' },
];

const SUPPLIERS = [
  { id: uid('sup-1'), name: 'Coffee Bean KG', phone: '+996 555 100 100' },
  { id: uid('sup-2'), name: 'Молочный Дом', phone: '+996 555 200 200' },
  { id: uid('sup-3'), name: 'Сладкая Выпечка', phone: '+996 555 300 300' },
  { id: uid('sup-4'), name: 'Мясной Ряд', phone: '+996 555 400 400' },
  { id: uid('sup-5'), name: 'Овощи от Фермера', phone: '+996 555 500 500' },
  { id: uid('sup-6'), name: 'Чайная Лавка', phone: '+996 555 600 600' },
  { id: uid('sup-7'), name: 'Пекарня №1', phone: '+996 555 700 700' },
  { id: uid('sup-8'), name: 'Фруктовый Сад', phone: '+996 555 800 800' },
];

const STAFF = [
  { id: uid('staff-1'), name: 'Айжан', role: 'cashier' as const },
  { id: uid('staff-2'), name: 'Бекжан', role: 'cashier' as const },
  { id: uid('staff-3'), name: 'Гуля', role: 'cashier' as const },
  { id: uid('staff-4'), name: 'Данияр', role: 'waiter' as const },
];

const WAREHOUSES = [
  { id: uid('wh-bar'), name: 'Бар' },
  { id: uid('wh-kitchen'), name: 'Кухня' },
];

const ZONES = [
  { id: uid('zone-main'), name: 'Основной зал', cols: 8, rows: 5 },
  { id: uid('zone-terrace'), name: 'Веранда', cols: 6, rows: 4 },
];

const TABLES = [
  { id: uid('tbl-1'), zoneId: uid('zone-main'), number: '1', capacity: 2 },
  { id: uid('tbl-2'), zoneId: uid('zone-main'), number: '2', capacity: 2 },
  { id: uid('tbl-3'), zoneId: uid('zone-main'), number: '3', capacity: 4 },
  { id: uid('tbl-4'), zoneId: uid('zone-main'), number: '4', capacity: 4 },
  { id: uid('tbl-5'), zoneId: uid('zone-main'), number: '5', capacity: 6 },
  { id: uid('tbl-6'), zoneId: uid('zone-terrace'), number: '21', capacity: 4 },
  { id: uid('tbl-7'), zoneId: uid('zone-terrace'), number: '22', capacity: 2 },
  { id: uid('tbl-8'), zoneId: uid('zone-terrace'), number: '23', capacity: 4 },
];

// ═══ ORDER GENERATION ═══

const dishWeights: Record<string, number> = {};
dishWeights[uid('d-cappuccino')] = 18;
dishWeights[uid('d-latte')] = 16;
dishWeights[uid('d-americano')] = 12;
dishWeights[uid('d-espresso')] = 8;
dishWeights[uid('d-raf')] = 7;
dishWeights[uid('d-flatwhite')] = 5;
dishWeights[uid('d-mokkachino')] = 4;
dishWeights[uid('d-cocoa')] = 4;
dishWeights[uid('d-green-tea')] = 4;
dishWeights[uid('d-black-tea')] = 3;
dishWeights[uid('d-croissant')] = 8;
dishWeights[uid('d-sandwich')] = 7;
dishWeights[uid('d-cheesecake')] = 6;
dishWeights[uid('d-brownie')] = 5;
dishWeights[uid('d-pancakes')] = 4;
dishWeights[uid('d-greek-salad')] = 3;
dishWeights[uid('d-smoothie')] = 4;
dishWeights[uid('d-lemonade')] = 5;

function generateOrderItems(): DishDef[] {
  const numItems = weightedPick([1, 2, 3], [55, 35, 10]);
  const items: DishDef[] = [];
  const used = new Set<string>();
  for (let i = 0; i < numItems; i++) {
    const available = DISHES.filter(d => !used.has(d.id));
    const weights = available.map(d => dishWeights[d.id] || 1);
    const dish = weightedPick(available, weights);
    used.add(dish.id);
    items.push(dish);
  }
  return items;
}

// ═══ MAIN ═══

async function seed() {
  console.log('🧹 Clearing via RPC...');
  process.stdout.write('  Calling RPC...\n');
  const { data: cleanResult, error: cleanErr } = await supabase.rpc('demo_clean_venue', { p_venue_id: VENUE_ID });
  if (cleanErr) {
    console.error(`  ❌ RPC cleanup failed: ${cleanErr.message}`);
  } else {
    console.log(`  ✓ Cleaned: ${cleanResult}`);
  }
  process.stdout.write('  RPC done, creating data...\n');

  console.log('\n🏗️  Creating categories...');
  for (const c of CATEGORIES) {
    const { error } = await supabase.from('categories').insert({
      id: c.id, venue_id: VENUE_ID, name: c.name, color_hex: c.color,
      sort_order: c.sort, is_active: true,
    });
    if (error) console.error(`  ❌ category ${c.name}: ${error.message}`);
  }

  console.log('🏗️  Creating products...');
  for (const d of DISHES) {
    const { error } = await supabase.from('products').insert({
      id: d.id, venue_id: VENUE_ID, category_id: d.categoryId,
      name: d.name, price: d.price, cost_price: d.costPrice,
      type: 'dish', is_active: true, sort_order: 0,
      workshop_id: d.workshop === 'bar' ? WORKSHOP_BAR_ID : WORKSHOP_KITCHEN_ID,
    });
    if (error) console.error(`  ❌ dish ${d.name}: ${error.message}`);
  }
  for (const ing of INGREDIENTS) {
    const { error } = await supabase.from('products').insert({
      id: ing.id, venue_id: VENUE_ID,
      name: ing.name, price: 0, cost_price: ing.costPrice,
      type: 'ingredient', unit: ing.unit, is_active: true, sort_order: 0,
      workshop_id: ing.workshop === 'bar' ? WORKSHOP_BAR_ID : WORKSHOP_KITCHEN_ID,
    });
    if (error) console.error(`  ❌ ing ${ing.name}: ${error.message}`);
  }

  console.log('🏗️  Creating recipe_items...');
  for (const r of RECIPES) {
    const { error } = await supabase.from('recipe_items').insert({
      product_id: r.dishId, ingredient_id: r.ingredientId,
      quantity: r.quantity, unit: r.unit,
    });
    if (error) console.error(`  ❌ recipe ${r.dishId}: ${error.message}`);
  }

  console.log('🏗️  Creating warehouses...');
  for (const w of WAREHOUSES) {
    const { error } = await supabase.from('warehouses').insert({ id: w.id, venue_id: VENUE_ID, name: w.name });
    if (error) console.error(`  ❌ warehouse ${w.name}: ${error.message}`);
  }

  console.log('🏗️  Creating suppliers...');
  for (const s of SUPPLIERS) {
    const { error } = await supabase.from('suppliers').insert({ id: s.id, venue_id: VENUE_ID, name: s.name, phone: s.phone });
    if (error) console.error(`  ❌ supplier ${s.name}: ${error.message}`);
  }

  console.log('🏗️  Creating zones & tables...');
  for (const z of ZONES) {
    const { error } = await supabase.from('zones').insert({
      id: z.id, venue_id: VENUE_ID, name: z.name,
      grid_cols: z.cols, grid_rows: z.rows, sort_order: 0,
    });
    if (error) console.error(`  ❌ zone ${z.name}: ${error.message}`);
  }
  for (const t of TABLES) {
    const { error } = await supabase.from('tables').insert({
      id: t.id, zone_id: t.zoneId, venue_id: VENUE_ID,
      number: t.number, capacity: t.capacity, col: 0, row: 0, size: 'regular',
    });
    if (error) console.error(`  ❌ table ${t.number}: ${error.message}`);
  }

  console.log('🏗️  Creating staff...');
  for (const s of STAFF) {
    const { error } = await supabase.from('users').insert({
      id: s.id, organization_id: ORG_ID, name: s.name, pin: '0000', role: s.role,
    });
    if (error) console.error(`  ❌ staff ${s.name}: ${error.message}`);
  }

  // ═══ GENERATE ORDERS VIA SQL RPC (fast, all in one transaction) ═══
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
  const startDateStr = thirtyDaysAgo.toISOString().split('T')[0];

  console.log(`\n🔄 Generating orders via SQL RPC for 30 days from ${startDateStr}...`);
  console.log('   (this runs entirely in Postgres — ~3 seconds)');
  
  const { data: genResult, error: genErr } = await supabase.rpc('demo_gen_orders', {
    p_venue_id: VENUE_ID,
    p_start_date: startDateStr,
    p_days: 30,
  });
  
  if (genErr) {
    console.error(`  ❌ Order generation failed: ${genErr.message}`);
  } else {
    console.log(`  ✓ SQL RPC: ${genResult}`);
  }

  // ═══ DELIVERIES ═══
  console.log('\n💾 Creating deliveries...');
  for (let w = 0; w < 4; w++) {
    for (const day of [rand(0, 2), rand(3, 5)]) {
      const delDate = new Date(thirtyDaysAgo.getTime() + (w * 7 + day) * 86400000);
      delDate.setHours(rand(9, 12), 0, 0, 0);
      
      const deliveryId = crypto.randomUUID();
      const supplier = pick(SUPPLIERS);
      const wh = pick(WAREHOUSES);
      
      const whIngs = INGREDIENTS.filter(i => {
        if (wh.id === uid('wh-bar')) return i.workshop === 'bar';
        return i.workshop === 'kitchen';
      });
      const numItems = rand(3, Math.min(6, whIngs.length));
      const selected = whIngs.slice(0, numItems);
      
      let totalAmount = 0;
      const items = selected.map(ing => {
        const cost = ing.costPrice * rand(3, 15);
        totalAmount += cost;
        return {
          id: crypto.randomUUID(), delivery_id: deliveryId,
          product_id: ing.id, name: ing.name,
          quantity: rand(2, 15), unit: ing.unit,
          price: Math.round(ing.costPrice),
        };
      });
      
      const { error: delErr } = await supabase.from('warehouse_deliveries').insert({
        id: deliveryId, venue_id: VENUE_ID,
        supplier: supplier.name, delivery_date: delDate.toISOString().split('T')[0],
        amount: Math.round(totalAmount * 100) / 100, status: 'received',
        warehouse_id: wh.id, created_at: delDate.toISOString(),
        workshop_id: wh.id === uid('wh-bar') ? WORKSHOP_BAR_ID : WORKSHOP_KITCHEN_ID,
      });
      if (delErr) console.error(`  ❌ delivery: ${delErr.message}`);
      
      const { error: ditemErr } = await supabase.from('warehouse_delivery_items').insert(items);
      if (ditemErr) console.error(`  ❌ delivery items: ${ditemErr.message}`);
    }
  }

  // ═══ WRITE-OFFS ═══
  console.log('\n💾 Creating write-offs...');
  for (let d = 0; d < 30; d += rand(3, 4)) {
    const woDate = new Date(thirtyDaysAgo.getTime() + d * 86400000);
    woDate.setHours(rand(20, 23), 0, 0, 0);
    
    const woId = crypto.randomUUID();
    const wh = pick(WAREHOUSES);
    const whIngs = INGREDIENTS.filter(i => {
      if (wh.id === uid('wh-bar')) return i.workshop === 'bar';
      return i.workshop === 'kitchen';
    });
    
    const selected = pick(whIngs);
    const items = [{
      id: crypto.randomUUID(), write_off_id: woId,
      product_id: selected.id, name: selected.name,
      quantity: Math.round(rand(1, 5) * 10) / 100,
      unit: selected.unit,
      reason: pick(['Истёк срок', 'Порча', 'Бой', 'Просрочка']),
    }];
    
    const { error: woErr } = await supabase.from('warehouse_write_offs').insert({
      id: woId, venue_id: VENUE_ID,
      reason_summary: pick(['Списание порчи', 'Истекшие продукты', 'Еженедельное списание']),
      write_off_date: woDate.toISOString().split('T')[0],
      status: 'posted', warehouse_id: wh.id,
      created_at: woDate.toISOString(),
      workshop_id: wh.id === uid('wh-bar') ? WORKSHOP_BAR_ID : WORKSHOP_KITCHEN_ID,
    });
    if (woErr) console.error(`  ❌ write-off: ${woErr.message}`);
    
    const { error: woItemErr } = await supabase.from('warehouse_write_off_items').insert(items);
    if (woItemErr) console.error(`  ❌ write-off items: ${woItemErr.message}`);
  }

  // ═══ INVENTORY ═══
  console.log('\n💾 Creating inventory sessions...');
  for (let w = 1; w <= 4; w++) {
    const invDate = new Date(thirtyDaysAgo.getTime() + w * 7 * 86400000);
    invDate.setHours(rand(9, 11), 0, 0, 0);
    
    for (const wh of WAREHOUSES) {
      const sessionId = crypto.randomUUID();
      const whIngs = INGREDIENTS.filter(i => {
        if (wh.id === uid('wh-bar')) return i.workshop === 'bar';
        return i.workshop === 'kitchen';
      });
      
      const { error: invErr } = await supabase.from('warehouse_inventory_sessions').insert({
        id: sessionId, venue_id: VENUE_ID, warehouse_id: wh.id,
        inventory_type: 'full', conducted_at: invDate.toISOString(),
        status: 'posted',
      });
      if (invErr) console.error(`  ❌ inventory session: ${invErr.message}`);
      
      const lines = whIngs.map(ing => {
        const theoretical = rand(5, 30);
        const actual = theoretical + rand(-2, 2);
        return {
          session_id: sessionId,
          product_id: ing.id, name: ing.name, unit: ing.unit,
          theoretical, actual,
          unit_price: Math.round(ing.costPrice),
        };
      });
      
      const { error: lineErr } = await supabase.from('warehouse_inventory_lines').insert(lines);
      if (lineErr) console.error(`  ❌ inventory lines: ${lineErr.message}`);
    }
  }

  // ═══ STOCK ═══
  console.log('\n💾 Creating stock items...');
  for (const ing of INGREDIENTS) {
    const wh = WAREHOUSES.find(w => {
      if (w.id === uid('wh-bar')) return ing.workshop === 'bar';
      return ing.workshop === 'kitchen';
    })!;
    
    const baseQty = ing.unit === 'кг' ? rand(3, 25) : ing.unit === 'л' ? rand(10, 40) : rand(30, 120);
    const { error } = await supabase.from('stock_items').insert({
      product_id: ing.id, warehouse_id: wh.id,
      quantity: baseQty, unit: ing.unit,
    });
    if (error) console.error(`  ❌ stock ${ing.name}: ${error.message}`);
  }

  // ═══ CASH MOVEMENTS — already done by SQL RPC ═══

  console.log('\\n✅ SEED COMPLETE!');
  console.log(`   ${DISHES.length} dishes, ${INGREDIENTS.length} ingredients`);
  console.log(`   ${CATEGORIES.length} categories, ${SUPPLIERS.length} suppliers`);
  console.log(`   ${STAFF.length} staff, ${TABLES.length} tables`);
  console.log('\\n🚀 Dashboard ready: http://localhost:5173');
}

seed().catch(err => {
  console.error('\n❌ SEED FAILED:', err);
  process.exit(1);
});
