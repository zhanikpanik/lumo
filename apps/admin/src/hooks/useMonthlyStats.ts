import { useQuery } from '@tanstack/react-query';
import { supabase, VENUE_ID } from '@/lib/supabase';

export interface DailyStats {
  date: string;        // '2026-05-15'
  dayOfWeek: string;   // 'пн'..'вс'
  revenue: number;
  expenses: number;
  net: number;
  orderCount: number;
  avgCheck: number;
}

async function fetchMonthlyStats(monthStart: string, monthEnd: string): Promise<DailyStats[]> {
  // Fetch paid orders for the period
  const { data: orders } = await supabase
    .from('orders')
    .select('total_amount, opened_at')
    .eq('venue_id', VENUE_ID)
    .eq('status', 'paid')
    .gte('opened_at', monthStart)
    .lt('opened_at', monthEnd)
    .order('opened_at');

  // Fetch expense cash movements for the period
  const { data: txns } = await supabase
    .from('cash_movements')
    .select('amount, occurred_at')
    .eq('venue_id', VENUE_ID)
    .eq('movement_type', 'float_out')
    .gte('occurred_at', monthStart)
    .lt('occurred_at', monthEnd)
    .order('occurred_at');

  // Group by date
  const dayMap = new Map<string, { revenue: number; expenses: number; orderCount: number }>();

  for (const o of orders || []) {
    const dateKey = (o.opened_at as string).slice(0, 10);
    const entry = dayMap.get(dateKey) || { revenue: 0, expenses: 0, orderCount: 0 };
    entry.revenue += Number(o.total_amount) || 0;
    entry.orderCount += 1;
    dayMap.set(dateKey, entry);
  }

  for (const t of txns || []) {
    const dateKey = (t.occurred_at as string).slice(0, 10);
    const entry = dayMap.get(dateKey) || { revenue: 0, expenses: 0, orderCount: 0 };
    entry.expenses += Number(t.amount) || 0;
    dayMap.set(dateKey, entry);
  }

  // Generate all days in the range, fill missing with 0
  const days: DailyStats[] = [];
  const start = new Date(monthStart);
  const end = new Date(monthEnd);
  const dayNames = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const dateKey = d.toISOString().slice(0, 10);
    const entry = dayMap.get(dateKey) || { revenue: 0, expenses: 0, orderCount: 0 };
    const net = entry.revenue - entry.expenses;
    days.push({
      date: dateKey,
      dayOfWeek: dayNames[d.getDay()],
      revenue: entry.revenue,
      expenses: entry.expenses,
      net,
      orderCount: entry.orderCount,
      avgCheck: entry.orderCount > 0 ? Math.round(entry.revenue / entry.orderCount) : 0,
    });
  }

  return days;
}

export function useMonthlyStats(start: string, end: string) {
  return useQuery({
    queryKey: ['monthly_stats', VENUE_ID, start, end],
    queryFn: () => fetchMonthlyStats(start, end),
    staleTime: 2 * 60 * 1000,
    // Keep previous data while loading new period
    placeholderData: (prev: unknown) => prev as DailyStats[] | undefined,
  });
}
