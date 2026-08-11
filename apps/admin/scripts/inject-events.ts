/**
 * Create 3 fresh warehouse events for demo: delivery, transfer, write-off.
 * All dated today so they appear in the chronology feed.
 * Run: node --import tsx/esm scripts/inject-events.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const c = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const V = '00000000-0000-0000-0000-000000000010';
const BAR = 'd2449b1e-e2be-813b-223c-169a2fdcbbf8';
const KITCHEN = 'e0e56d3d-36a4-2977-87e3-2ea1c3c54f2b';
const now = new Date().toISOString();

async function main() {
  // ═══ 1. ПОСТАВКА: Молоко + Сливки в Бар ═══
  const delId = crypto.randomUUID();
  const { data: del, error: delErr } = await c.from('warehouse_deliveries').insert({
    id: delId, venue_id: V, warehouse_id: BAR,
    supplier: 'Молочный Дом', delivery_date: now,
    amount: 2400, status: 'received', created_at: now,
  }).select().single();
  console.log('1. ПОСТАВКА:', delErr?.message || `OK ${del?.id?.slice(0, 8)}`);

  await c.from('warehouse_delivery_items').insert([
    { delivery_id: delId, product_id: '68cdf7eb-9b96-d6c8-bfa2-d29d81b18c98', name: 'Молоко 3.2%', quantity: 20, unit: 'л', price: 80 },
    { delivery_id: delId, product_id: '37dd563c-a561-77a0-45d2-02f97a711491', name: 'Сливки 33%', quantity: 5, unit: 'л', price: 350 },
  ]);

  // ═══ 2. ПЕРЕМЕЩЕНИЕ: Сахар из Кухни в Бар ═══
  const trId = crypto.randomUUID();
  const { data: tr, error: trErr } = await c.from('warehouse_transfers').insert({
    id: trId, venue_id: V, from_warehouse_id: KITCHEN, to_warehouse_id: BAR,
    transfer_date: now, comment: 'Сахар для бара', status: 'posted', created_at: now,
  }).select().single();
  console.log('2. ПЕРЕМЕЩЕНИЕ:', trErr?.message || `OK ${tr?.id?.slice(0, 8)}`);

  await c.from('warehouse_transfer_items').insert([
    { transfer_id: trId, product_id: '4e60e4cc-39ca-4bdf-111d-1efccb849f61', name: 'Сахар', quantity: 5, unit: 'кг' },
  ]);

  // ═══ 3. СПИСАНИЕ: Ягоды в Баре ═══
  const woId = crypto.randomUUID();
  const { data: wo, error: woErr } = await c.from('warehouse_write_offs').insert({
    id: woId, venue_id: V, warehouse_id: BAR,
    reason_summary: 'Порча — разморозились', write_off_date: now,
    status: 'posted', created_at: now,
  }).select().single();
  console.log('3. СПИСАНИЕ:', woErr?.message || `OK ${wo?.id?.slice(0, 8)}`);

  await c.from('warehouse_write_off_items').insert([
    { write_off_id: woId, product_id: '46d8c607-9949-664f-e344-313483cfe131', name: 'Ягоды замороженные', quantity: 1.2, unit: 'кг', reason: 'Порча' },
  ]);

  console.log(`\n✅ Готово: ${now}`);
}

main();
