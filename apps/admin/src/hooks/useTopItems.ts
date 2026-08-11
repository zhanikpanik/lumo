import { useQuery } from '@tanstack/react-query';
import { supabase, VENUE_ID } from '@/lib/supabase';

export interface TopItem {
  name: string;
  value: number;      // revenue for dishes, consumption for ingredients
  secondary: number;  // order count for dishes, stock remaining for ingredients
}

async function fetchTopItems(start: string, end: string) {
  // 1. Get order IDs in period
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('venue_id', VENUE_ID)
    .eq('status', 'paid')
    .gte('opened_at', start)
    .lt('opened_at', end);

  const orderIds = (orders || []).map((o) => o.id);

  // 2. Top dishes from order_items
  let dishes: TopItem[] = [];
  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from('order_items')
      .select('product_name, quantity, product_price')
      .in('order_id', orderIds);

    const dishMap = new Map<string, { qty: number; revenue: number }>();
    for (const item of items || []) {
      const name = item.product_name as string;
      const qty = Number(item.quantity) || 1;
      const price = Number(item.product_price) || 0;
      const existing = dishMap.get(name) || { qty: 0, revenue: 0 };
      existing.qty += qty;
      existing.revenue += qty * price;
      dishMap.set(name, existing);
    }

    dishes = Array.from(dishMap.entries())
      .map(([name, { qty, revenue }]) => ({
        name,
        value: revenue,
        secondary: qty,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }

  // 3. Top ingredients (by current stock — not period-dependent)
  // Show ingredients with lowest stock as "top" by consumption urgency
  const { data: lowStock } = await supabase
    .from('products')
    .select('name, stock_quantity')
    .eq('venue_id', VENUE_ID)
    .eq('type', 'ingredient')
    .order('stock_quantity')
    .limit(10);

  const ingredients: TopItem[] = (lowStock || []).map((p) => ({
    name: p.name as string,
    value: Number(p.stock_quantity) || 0,       // stock remaining (lower = more urgent)
    secondary: 0,
  }));

  return { dishes, ingredients };
}

export function useTopItems(start: string, end: string) {
  return useQuery({
    queryKey: ['top_items', VENUE_ID, start, end],
    queryFn: () => fetchTopItems(start, end),
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev: unknown) => prev as { dishes: TopItem[]; ingredients: TopItem[] } | undefined,
  });
}
