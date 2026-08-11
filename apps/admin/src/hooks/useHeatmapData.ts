import { useQuery } from '@tanstack/react-query';
import { supabase, VENUE_ID } from '@/lib/supabase';

export interface HourlyBucket {
  dayIndex: number;   // 0=пн … 6=вс
  hour: number;       // 7..23
  orderCount: number;
  revenue: number;
  avgCheck: number;
}

async function fetchHeatmap(start: string, end: string): Promise<HourlyBucket[]> {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('total_amount, opened_at')
    .eq('venue_id', VENUE_ID)
    .eq('status', 'paid')
    .gte('opened_at', start)
    .lt('opened_at', end);

  if (error) throw error;
  if (!orders || orders.length === 0) return [];

  // Build heatmap: dayIndex × hour → aggregate
  // Key: `${dayIndex}-${hour}`
  const bucketMap = new Map<number, Map<number, { orderCount: number; revenue: number }>>();

  for (const o of orders) {
    const ts = new Date(o.opened_at as string);
    let dayOfWeek = ts.getDay(); // 0=Sun..6=Sat
    // Convert to 0=Mon..6=Sun
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const hour = ts.getHours();

    if (hour < 7 || hour > 23) continue;

    if (!bucketMap.has(dayIndex)) bucketMap.set(dayIndex, new Map());
    const hourMap = bucketMap.get(dayIndex)!;
    const existing = hourMap.get(hour) || { orderCount: 0, revenue: 0 };
    existing.orderCount += 1;
    existing.revenue += Number(o.total_amount) || 0;
    hourMap.set(hour, existing);
  }

  // Fill all 7 days × 17 hours (7–23), even empty ones
  const buckets: HourlyBucket[] = [];
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    for (let hour = 7; hour <= 23; hour++) {
      const hourMap = bucketMap.get(dayIdx);
      const entry = hourMap?.get(hour);
      const orderCount = entry?.orderCount ?? 0;
      const revenue = entry?.revenue ?? 0;

      buckets.push({
        dayIndex: dayIdx,
        hour,
        orderCount,
        revenue,
        avgCheck: orderCount > 0 ? Math.round(revenue / orderCount) : 0,
      });
    }
  }

  return buckets;
}

export function useHeatmapData(start: string, end: string) {
  return useQuery({
    queryKey: ['heatmap', VENUE_ID, start, end],
    queryFn: () => fetchHeatmap(start, end),
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev: unknown) => prev as HourlyBucket[] | undefined,
  });
}
