import { useQuery } from '@tanstack/react-query';
import { supabase, VENUE_ID } from '@/lib/supabase';

// ── Types ──

export interface DailyProfitRow {
  date: string;
  dayOfWeek: string;
  revenue: number;
  theoreticalCogs: number;
  actualCogs: number | null;
  laborHours: number;
  laborCost: number;
  primeCostPct: number | null;
  splh: number | null;
  ebit: number | null;
}

/** Одна ячейка тепловой карты SPLH: день недели × час */
export interface HourlySplhCell {
  dayIndex: number;   // 0=Mon..6=Sun
  hour: number;       // 7..23
  revenue: number;
  laborHours: number;
  splh: number | null; // revenue / laborHours, null if laborHours = 0
}

export interface ProfitData {
  rows: DailyProfitRow[];
  splhHeatmap: HourlySplhCell[];
  periodLabel: string;
  hourlyRate: number;
  dailyFixedCost: number;
}

// ── Constants ──

const DEMO_HOURLY_RATE = 150;
const DEMO_DAILY_FIXED = 5000;

// ── Helpers ──

const DAY_LABELS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayLabel(date: string): string {
  return DAY_LABELS[new Date(date).getDay()];
}

/** Convert JS day (0=Sun) to our index (0=Mon) */
function dayOfWeekIndex(ts: string): number {
  const d = new Date(ts).getDay();
  return d === 0 ? 6 : d - 1;
}

// ── Cost index ──

interface CostIndex {
  [dishId: string]: number;
}

async function buildCostIndex(): Promise<CostIndex> {
  const { data: recipes } = await supabase
    .from('recipe_items')
    .select('product_id, ingredient_id, quantity, unit');

  if (!recipes?.length) return {};

  const ingredientIds = Array.from(new Set(recipes.map((r) => r.ingredient_id as string)));
  const { data: ingredients } = await supabase
    .from('products')
    .select('id, cost_price')
    .in('id', ingredientIds);

  const costMap = new Map<string, number>();
  for (const ing of ingredients || []) {
    costMap.set(ing.id as string, Number(ing.cost_price) || 0);
  }

  const dishCost: CostIndex = {};
  for (const r of recipes) {
    const dishId = r.product_id as string;
    const ingCost = costMap.get(r.ingredient_id as string) || 0;
    const qty = Number(r.quantity) || 0;
    dishCost[dishId] = (dishCost[dishId] || 0) + qty * ingCost;
  }

  return dishCost;
}

// ── Main fetch ──

async function fetchProfitData(periodStart: string, periodEnd: string): Promise<ProfitData> {
  // 1. Revenue + theoretical COGS from order_items
  const [costIndex, { data: items, error: itemsErr }] = await Promise.all([
    buildCostIndex(),
    supabase
      .from('order_items')
      .select('product_name, quantity, product_price, product_id, orders!inner(opened_at)')
      .eq('orders.venue_id', VENUE_ID)
      .eq('orders.status', 'paid')
      .gte('orders.opened_at', periodStart)
      .lt('orders.opened_at', periodEnd),
  ]);

  if (itemsErr) throw itemsErr;

  const dayRevenue = new Map<string, number>();
  const dayTheoCogs = new Map<string, number>();
  // Revenue per [dayIndex, hour]
  const hourlyRevenue = new Map<string, number>(); // key: "dow:hour"

  for (const item of items || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ordersRaw = (item as Record<string, unknown>).orders;
    const orders = (Array.isArray(ordersRaw) ? ordersRaw[0] : ordersRaw) as {
      opened_at: string;
    } | null;
    if (!orders) continue;

    const ts = orders.opened_at as string;
    const date = ts.slice(0, 10);
    const hour = new Date(ts).getHours();
    const dow = dayOfWeekIndex(ts);
    const qty = Number(item.quantity) || 1;
    const price = Number(item.product_price) || 0;
    const revenue = qty * price;
    const unitCost = costIndex[item.product_id as string] || 0;
    const cost = qty * unitCost;

    dayRevenue.set(date, (dayRevenue.get(date) || 0) + revenue);
    dayTheoCogs.set(date, (dayTheoCogs.get(date) || 0) + cost);

    const hKey = `${dow}:${hour}`;
    hourlyRevenue.set(hKey, (hourlyRevenue.get(hKey) || 0) + revenue);
  }

  // 2. Actual COGS from inventory_movements
  const { data: movements, error: movErr } = await supabase
    .from('inventory_movements')
    .select('quantity_delta, product_id, occurred_at')
    .eq('venue_id', VENUE_ID)
    .eq('reason', 'sale')
    .gte('occurred_at', periodStart)
    .lt('occurred_at', periodEnd);

  if (movErr) throw movErr;

  const movProductIds = Array.from(new Set((movements || []).map((m) => m.product_id as string)));
  const movPriceMap = new Map<string, number>();
  if (movProductIds.length > 0) {
    for (let i = 0; i < movProductIds.length; i += 100) {
      const batch = movProductIds.slice(i, i + 100);
      const { data: prods } = await supabase
        .from('products')
        .select('id, cost_price')
        .in('id', batch);
      for (const p of prods || []) {
        movPriceMap.set(p.id as string, Number(p.cost_price) || 0);
      }
    }
  }

  const dayActualCogs = new Map<string, number>();
  for (const m of movements || []) {
    const qty = Number(m.quantity_delta) || 0;
    if (qty >= 0) continue;
    const price = movPriceMap.get(m.product_id as string) || 0;
    const cost = Math.abs(qty) * price;
    const date = (m.occurred_at as string).slice(0, 10);
    dayActualCogs.set(date, (dayActualCogs.get(date) || 0) + cost);
  }

  // 3. Shifts → labor hours per day + per hour
  const { data: shifts, error: shiftErr } = await supabase
    .from('shifts')
    .select('opened_at, closed_at')
    .eq('venue_id', VENUE_ID)
    .gte('opened_at', periodStart)
    .lt('opened_at', periodEnd);

  if (shiftErr) throw shiftErr;

  const dayLaborHours = new Map<string, number>();
  const hourlyLabor = new Map<string, number>();

  for (const s of shifts || []) {
    const open = s.opened_at as string;
    const close = (s.closed_at as string) || new Date().toISOString();
    const openDate = new Date(open);
    const closeDate = new Date(close);
    const totalHours = (closeDate.getTime() - openDate.getTime()) / (1000 * 60 * 60);

    // Distribute across calendar days
    const cursor = new Date(openDate);
    while (cursor < closeDate) {
      const dayKey = iso(cursor);
      const dayEnd = new Date(cursor);
      dayEnd.setHours(23, 59, 59, 999);
      const segmentEnd = dayEnd < closeDate ? dayEnd : closeDate;
      const hours = (segmentEnd.getTime() - cursor.getTime()) / (1000 * 60 * 60);
      if (hours > 0) {
        dayLaborHours.set(dayKey, (dayLaborHours.get(dayKey) || 0) + hours);
      }
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
    }

    // Distribute across clock hours (for heatmap)
    // For each clock hour the shift covers, add a proportional slice of labor
    const hourCursor = new Date(openDate);
    while (hourCursor < closeDate) {
      const h = hourCursor.getHours();
      const dow = dayOfWeekIndex(hourCursor.toISOString());
      const hourEnd = new Date(hourCursor);
      hourEnd.setHours(h + 1, 0, 0, 0);
      const segmentEnd = hourEnd < closeDate ? hourEnd : closeDate;
      const segHours = (segmentEnd.getTime() - hourCursor.getTime()) / (1000 * 60 * 60);
      if (segHours > 0) {
        const hKey = `${dow}:${h}`;
        hourlyLabor.set(hKey, (hourlyLabor.get(hKey) || 0) + segHours);
      }
      hourCursor.setHours(h + 1, 0, 0, 0);
    }
  }

  // 4. Build daily rows
  const rows: DailyProfitRow[] = [];
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const date = iso(d);
    const revenue = dayRevenue.get(date) || 0;
    const theoreticalCogs = dayTheoCogs.get(date) || 0;
    const actualCogs = dayActualCogs.has(date) ? (dayActualCogs.get(date) || 0) : null;
    const laborHours = dayLaborHours.get(date) || 0;
    const laborCost = laborHours * DEMO_HOURLY_RATE;
    const cogs = actualCogs ?? theoreticalCogs;

    const primeCostPct = revenue > 0 ? Math.round(((cogs + laborCost) / revenue) * 100) : null;
    const splh = laborHours > 0 ? Math.round(revenue / laborHours) : null;
    const ebit = revenue - cogs - laborCost - DEMO_DAILY_FIXED;

    rows.push({
      date,
      dayOfWeek: dayLabel(date),
      revenue,
      theoreticalCogs,
      actualCogs,
      laborHours,
      laborCost,
      primeCostPct,
      splh,
      ebit: revenue > 0 ? ebit : null,
    });
  }

  // 5. Build hourly SPLH heatmap
  const splhHeatmap: HourlySplhCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 7; hour <= 23; hour++) {
      const hKey = `${dow}:${hour}`;
      const revenue = hourlyRevenue.get(hKey) || 0;
      const laborHours = hourlyLabor.get(hKey) || 0;
      splhHeatmap.push({
        dayIndex: dow,
        hour,
        revenue,
        laborHours,
        splh: laborHours > 0 ? Math.round(revenue / laborHours) : null,
      });
    }
  }

  // Period label
  const sDate = new Date(periodStart);
  const eDate = new Date(periodEnd);
  eDate.setDate(eDate.getDate() - 1);
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const periodLabel =
    sDate.getMonth() === eDate.getMonth()
      ? `${sDate.getDate()}–${eDate.getDate()} ${months[eDate.getMonth()]} ${eDate.getFullYear()}`
      : `${sDate.getDate()} ${months[sDate.getMonth()]} – ${eDate.getDate()} ${months[eDate.getMonth()]} ${eDate.getFullYear()}`;

  return {
    rows,
    splhHeatmap,
    periodLabel,
    hourlyRate: DEMO_HOURLY_RATE,
    dailyFixedCost: DEMO_DAILY_FIXED,
  };
}

// ── Hook ──

export function useAnalyticsProfit(start: string, end: string) {
  return useQuery({
    queryKey: ['analytics-profit', VENUE_ID, start, end],
    queryFn: () => fetchProfitData(start, end),
    staleTime: 2 * 60 * 1000,
  });
}
