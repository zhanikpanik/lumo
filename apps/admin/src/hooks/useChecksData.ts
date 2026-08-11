import { useQuery } from '@tanstack/react-query';
import { supabase, VENUE_ID } from '@/lib/supabase';

export interface CheckItem {
  name: string;
  qty: number;
  price: number;
  /** null если в order_items нет product_id */
  productId: string | null;
  /**
   * Себестоимость единицы из products.cost_price на момент загрузки.
   * null — нет product_id, продукт не найден или cost_price не задан в БД.
   */
  unitCost: number | null;
}

export interface OrderEvent {
  id: number;
  action: string;
  productName: string | null;
  quantity: number | null;
  unitPrice: number | null;
  occurredAt: string;
}

export type OrderSource = 'pos' | 'glovo' | 'yandex_eda';

export interface Check {
  id: string;
  tableNumber: string;
  waiter: string;
  paymentMethod: 'cash' | 'card' | 'none';
  status: 'open' | 'closed' | 'cancelled';
  openedAt: string;
  closedAt: string;
  paid: number;
  discount: number;
  items: CheckItem[];
  /** Сумма qty×(price−unitCost) только по строкам с известной себестоимостью */
  profit: number;
  /** true если есть позиции без учёта в прибыли (нет id / cost_price) */
  profitIncomplete: boolean;
  /** true — быстрый чек (на вынос), false — за столом */
  isQuickCheck: boolean;
  /** Источник заказа: pos / glovo / yandex_eda */
  source: OrderSource;
  /** Номер заказа в агрегаторе (для сверки) */
  externalOrderId: string | null;
  /** События чека из order_events (хронология) */
  events: OrderEvent[];
}

interface OrderRow {
  id: string;
  table_number?: string | null;
  status: string;
  opened_at: string;
  closed_at?: string | null;
  total_amount?: number | string | null;
  is_quick_check?: boolean | null;
  source?: string | null;
  external_order_id?: string | null;
  users?: { name?: string | null } | { name?: string | null }[] | null;
}

interface OrderItemRow {
  order_id: string;
  product_name: string;
  product_price: number | string;
  quantity: number;
  product_id?: string | null;
}

interface OrderEventRow {
  id: number;
  order_id: string;
  action: string;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  occurred_at: string;
}

function orderWaiterName(users: OrderRow['users']): string {
  if (!users) return '—';
  if (Array.isArray(users)) return users[0]?.name || '—';
  return users.name || '—';
}

async function fetchProductCostMap(productIds: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(productIds.filter(Boolean))];
  const map = new Map<string, number>();
  if (unique.length === 0) return map;

  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('products')
      .select('id, cost_price')
      .eq('venue_id', VENUE_ID)
      .in('id', chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = String((row as { id: string }).id);
      const cp = (row as { cost_price?: unknown }).cost_price;
      if (cp === null || cp === undefined) continue;
      const n = Number(cp);
      if (!Number.isFinite(n)) continue;
      map.set(id, n);
    }
  }
  return map;
}

function buildItemsByOrder(
  rows: OrderItemRow[],
  costByProduct: Map<string, number>,
): Record<string, CheckItem[]> {
  const itemsByOrder: Record<string, CheckItem[]> = {};
  for (const item of rows) {
    const oid = item.order_id;
    if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
    const pid = item.product_id != null && item.product_id !== '' ? String(item.product_id) : null;
    const unitCost = pid != null && costByProduct.has(pid) ? costByProduct.get(pid)! : null;
    itemsByOrder[oid].push({
      name: item.product_name,
      qty: item.quantity,
      price: Number(item.product_price),
      productId: pid,
      unitCost,
    });
  }
  return itemsByOrder;
}

function profitFromItems(items: CheckItem[]): { profit: number; incomplete: boolean } {
  if (items.length === 0) return { profit: 0, incomplete: false };
  let profit = 0;
  let incomplete = false;
  for (const i of items) {
    if (i.unitCost === null) {
      incomplete = true;
      continue;
    }
    profit += i.qty * (i.price - i.unitCost);
  }
  return { profit, incomplete };
}

function mapOrderToCheck(
  o: OrderRow,
  itemsByOrder: Record<string, CheckItem[]>,
  paymentByOrder: Record<string, { method: string; amount: number } | undefined>,
  eventsByOrder: Record<string, OrderEvent[]>,
): Check {
  const payment = paymentByOrder[o.id];
  const method = payment?.method || 'none';

  const paid =
    payment != null ? Number(payment.amount) : Number(o.total_amount ?? 0);

  const items = itemsByOrder[o.id] || [];
  const { profit, incomplete: profitIncomplete } = profitFromItems(items);

  // TODO: when DB has source/external_order_id columns, add to SELECT and remove defaults
  const source: OrderSource = (o.source === 'glovo' || o.source === 'yandex_eda')
    ? (o.source as OrderSource)
    : 'pos';

  return {
    id: o.id,
    tableNumber: o.table_number || '—',
    waiter: orderWaiterName(o.users),
    paymentMethod: method === 'cash' || method === 'card' ? method : 'none',
    status: o.status === 'active' || o.status === 'alert' ? 'open' : o.status === 'cancelled' ? 'cancelled' : 'closed',
    openedAt: o.opened_at,
    closedAt: o.closed_at || '',
    paid,
    discount: 0,
    items,
    profit,
    profitIncomplete,
    isQuickCheck: Boolean(o.is_quick_check),
    source,
    externalOrderId: o.external_order_id || null,
    events: eventsByOrder[o.id] || [],
  };
}

/**
 * Разбивает массив ID на чанки и собирает результаты из Supabase.
 * Нужно потому что `.in('col', ids)` падает с Bad Request при >~500 значений.
 */
async function chunkedInQuery<T>(
  table: string,
  column: string,
  ids: string[],
  select: string,
): Promise<T[]> {
  const chunkSize = 300;
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in(column, chunk);
    if (error) throw error;
    if (data) results.push(...(data as T[]));
  }
  return results;
}

async function fetchChecks(fromDate?: string): Promise<Check[]> {
  let query = supabase
    .from('orders')
    .select(
      'id, table_number, zone_name, status, opened_at, closed_at, total_amount, waiter_id, is_quick_check, users(name)',
    )
    .eq('venue_id', VENUE_ID)
    .order('opened_at', { ascending: false })
    .limit(3000);

  if (fromDate) {
    query = query.gte('opened_at', fromDate);
  }

  const { data: orders, error } = await query;

  if (error) throw error;
  if (!orders || orders.length === 0) return [];

  const orderRows = orders as OrderRow[];
  const orderIds = orderRows.map((o) => o.id);

  // Чанкированные запросы — чтобы не превысить лимит IN
  const rawItems = await chunkedInQuery<OrderItemRow>(
    'order_items',
    'order_id',
    orderIds,
    'order_id, product_name, product_price, quantity, product_id',
  );

  const productIds = rawItems.map((r) => (r.product_id != null ? String(r.product_id) : '')).filter(Boolean);
  const costByProduct = await fetchProductCostMap(productIds);

  const itemsByOrder = buildItemsByOrder(rawItems, costByProduct);

  const allPayments = await chunkedInQuery<{ order_id: string; method: string; amount: number }>(
    'payments',
    'order_id',
    orderIds,
    'order_id, method, amount',
  );

  const paymentByOrder: Record<string, { method: string; amount: number }> = {};
  for (const p of allPayments) {
    paymentByOrder[p.order_id] = { method: p.method, amount: Number(p.amount) };
  }

  // Order events — real history
  const rawEvents = await chunkedInQuery<OrderEventRow>(
    'order_events',
    'order_id',
    orderIds,
    'id, order_id, action, product_name, quantity, unit_price, occurred_at',
  );
  rawEvents.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  const eventsByOrder: Record<string, OrderEvent[]> = {};
  for (const ev of rawEvents) {
    if (!eventsByOrder[ev.order_id]) eventsByOrder[ev.order_id] = [];
    eventsByOrder[ev.order_id].push({
      id: ev.id,
      action: ev.action,
      productName: ev.product_name,
      quantity: ev.quantity,
      unitPrice: ev.unit_price,
      occurredAt: ev.occurred_at,
    });
  }

  const seen = new Set<string>();
  const uniqueOrders = orderRows.filter((o) => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });

  return uniqueOrders.map((o) => mapOrderToCheck(o, itemsByOrder, paymentByOrder, eventsByOrder));
}

export function useChecks(fromDate?: string) {
  return useQuery<Check[]>({
    queryKey: ['checks', VENUE_ID, fromDate],
    queryFn: () => fetchChecks(fromDate),
    // 60s: checks are dynamic but 30s was too chatty
    staleTime: 60 * 1000,
  });
}
