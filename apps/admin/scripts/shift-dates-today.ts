/**
 * Shift all demo dates so the latest order falls on today.
 * Run: pnpm run demo:shift-today
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const VENUE_ID = '00000000-0000-0000-0000-000000000010';

async function main() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`Shifting dates to today: ${today}...`);
  
  const { data, error } = await supabase.rpc('demo_shift_dates', {
    p_venue_id: VENUE_ID,
    p_target_date: today,
  });
  
  if (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
  
  console.log(data || 'Done');
  
  // Verify
  const { data: latest } = await supabase
    .from('orders')
    .select('opened_at')
    .eq('venue_id', VENUE_ID)
    .order('opened_at', { ascending: false })
    .limit(1);
  
  if (latest?.[0]) {
    console.log('Latest order:', latest[0].opened_at);
  }
}

main();
