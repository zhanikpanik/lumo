import { useQuery } from '@tanstack/react-query';
import { supabase, VENUE_ID } from '@/lib/supabase';

export interface WeekSlice {
  label: string;          // '28 апр – 4 мая'
  days: {
    dayOfWeek: string;    // 'пн'..'вс'
    date: string;         // '2026-04-28'
    revenue: number;
    expenses: number;
  }[];
  totalRevenue: number;
  totalExpenses: number;
}

const DAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MONTH_NAMES = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Get ISO week boundaries for all weeks that overlap with [start, end] */
function getWeeksInRange(start: string, end: string): { start: Date; end: Date }[] {
  const weeks: { start: Date; end: Date }[] = [];
  const s = new Date(start);
  const e = new Date(end);

  // Move to Monday of the week containing `start`
  const cursor = new Date(s);
  const dayOfWeek = cursor.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  cursor.setDate(cursor.getDate() + mondayOffset);
  cursor.setHours(0, 0, 0, 0);

  while (cursor < e) {
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weeks.push({ start: new Date(cursor), end: weekEnd });
    cursor.setDate(cursor.getDate() + 7);
  }

  return weeks;
}

async function fetchWeeklyStats(start: string, end: string): Promise<WeekSlice[]> {
  // Fetch all paid orders in range
  const { data: orders } = await supabase
    .from('orders')
    .select('total_amount, opened_at')
    .eq('venue_id', VENUE_ID)
    .eq('status', 'paid')
    .gte('opened_at', start)
    .lt('opened_at', end)
    .order('opened_at');

  // Fetch expenses in range
  const { data: txns } = await supabase
    .from('cash_movements')
    .select('amount, occurred_at')
    .eq('venue_id', VENUE_ID)
    .eq('movement_type', 'float_out')
    .gte('occurred_at', start)
    .lt('occurred_at', end);

  // Index by date key
  const dayMap = new Map<string, { revenue: number; expenses: number }>();

  for (const o of orders || []) {
    const dk = (o.opened_at as string).slice(0, 10);
    const entry = dayMap.get(dk) || { revenue: 0, expenses: 0 };
    entry.revenue += Number(o.total_amount) || 0;
    dayMap.set(dk, entry);
  }
  for (const t of txns || []) {
    const dk = (t.occurred_at as string).slice(0, 10);
    const entry = dayMap.get(dk) || { revenue: 0, expenses: 0 };
    entry.expenses += Number(t.amount) || 0;
    dayMap.set(dk, entry);
  }

  // Build weeks
  const weeks = getWeeksInRange(start, end);
  return weeks.map(({ start: ws }) => {
    const days: WeekSlice['days'] = [];
    let totalRevenue = 0;
    let totalExpenses = 0;

    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(ws.getDate() + i);
      const dateKey = d.toISOString().slice(0, 10);
      const entry = dayMap.get(dateKey) || { revenue: 0, expenses: 0 };
      const dow = d.getDay(); // 0=Sun
      const dayLabel = DAY_LABELS[dow === 0 ? 6 : dow - 1]; // Mon=0

      totalRevenue += entry.revenue;
      totalExpenses += entry.expenses;

      days.push({
        dayOfWeek: dayLabel,
        date: dateKey,
        revenue: entry.revenue,
        expenses: entry.expenses,
      });
    }

    // Label: "28 апр – 4 мая"
    const startDay = ws.getDate();
    const startMonth = MONTH_NAMES[ws.getMonth()];
    const endDate = new Date(ws);
    endDate.setDate(ws.getDate() + 6);
    const endDay = endDate.getDate();
    const endMonth = MONTH_NAMES[endDate.getMonth()];
    const label = startMonth === endMonth
      ? `${startDay} – ${endDay} ${endMonth}`
      : `${startDay} ${startMonth} – ${endDay} ${endMonth}`;

    return { label, days, totalRevenue, totalExpenses };
  });
}

export function useWeeklyStats(start: string, end: string) {
  return useQuery({
    queryKey: ['weekly_stats', VENUE_ID, start, end],
    queryFn: () => fetchWeeklyStats(start, end),
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev: unknown) => prev as WeekSlice[] | undefined,
  });
}
