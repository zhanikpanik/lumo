import { getInstantClient } from '@/data/instant';
import { adminAllOrdersQuery, adminOrderDetailQuery } from '@lumo/data';
import { useVenueId } from './useVenueId';
import { instantOne } from '@/lib/instantLink';

export interface CheckModifier {
  name: string;
  price: number;
}

export interface CheckItem {
  name: string;
  qty: number;
  price: number;
  productId: string | null;
  unitCost: number | null;
  modifiers: CheckModifier[];
}

export interface OrderEvent {
  id: string;
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
  profit: number;
  profitIncomplete: boolean;
  isQuickCheck: boolean;
  source: OrderSource;
  externalOrderId: string | null;
  events: OrderEvent[];
  total: number;
}

function tyinToSom(tyin: number): number {
  return tyin / 100;
}

function profitFromItems(items: CheckItem[]): { profit: number; incomplete: boolean } {
  if (items.length === 0) return { profit: 0, incomplete: false };
  let profit = 0;
  let incomplete = false;
  for (const item of items) {
    if (item.unitCost === null) {
      incomplete = true;
      continue;
    }
    const modifierRevenue = item.modifiers.reduce((sum, modifier) => sum + modifier.price, 0);
    if (item.modifiers.length > 0) incomplete = true;
    profit += item.qty * (item.price + modifierRevenue - item.unitCost);
  }
  return { profit, incomplete };
}

function mapStatus(status: string): 'open' | 'closed' | 'cancelled' {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'paid' || status === 'closed') return 'closed';
  return 'open';
}

export const CHECKS_PAGE_SIZE = 50;

export interface ChecksPageOptions {
  from?: Date;
  to?: Date;
  page?: number;
}

export function useInstantChecks({ from, to, page = 0 }: ChecksPageOptions = {}) {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminAllOrdersQuery(venueId, {
    from,
    to,
    limit: CHECKS_PAGE_SIZE,
    offset: page * CHECKS_PAGE_SIZE,
  }));

  const paymentsByOrder = new Map<string, NonNullable<typeof result.data>['payments']>();
  for (const payment of result.data?.payments ?? []) {
    const order = Array.isArray(payment.order) ? payment.order[0] : payment.order;
    if (!order) continue;
    const payments = paymentsByOrder.get(order.id) ?? [];
    payments.push(payment);
    paymentsByOrder.set(order.id, payments);
  }

  const eventsByOrder = new Map<string, OrderEvent[]>();
  for (const event of result.data?.orderEvents ?? []) {
    const order = Array.isArray(event.order) ? event.order[0] : event.order;
    if (!order) continue;
    const events = eventsByOrder.get(order.id) ?? [];
    const meta = event.metadata as Record<string, unknown> | undefined;
    events.push({
      id: event.id,
      action: event.action,
      productName: (meta?.productName as string) ?? null,
      quantity: (meta?.quantity as number) ?? null,
      unitPrice: (meta?.unitPrice as number) ?? null,
      occurredAt: new Date(event.occurredAt).toISOString(),
    });
    eventsByOrder.set(order.id, events);
  }

  const boundedOrders = (result.data?.orders ?? []).filter((order) => {
    const openedAt = new Date(order.openedAt).getTime();
    return (!from || openedAt >= from.getTime()) && (!to || openedAt < to.getTime());
  });

  const data: Check[] = boundedOrders.map(o => {
    const payments = paymentsByOrder.get(o.id) ?? [];
    const paid = payments.reduce((sum, payment) => sum + tyinToSom(payment.amountTiyin), 0);
    const paymentMethod: 'cash' | 'card' | 'none' =
      payments.length === 0 ? 'none'
      : payments.some(payment => payment.method === 'card') ? 'card'
      : 'cash';
    const source: OrderSource =
      o.source === 'glovo' || o.source === 'yandex_eda' ? o.source : 'pos';

    const table = instantOne(o.table);
    const ownerEmployee = instantOne(o.ownerEmployee);
    return {
      id: o.id,
      tableNumber: table?.number || o.tableNumber || '—',
      waiter: ownerEmployee?.displayName || '—',
      paymentMethod,
      status: mapStatus(o.status),
      openedAt: new Date(o.openedAt).toISOString(),
      closedAt: o.closedAt ? new Date(o.closedAt).toISOString() : '',
      paid,
      discount: 0,
      items: [],
      profit: 0,
      profitIncomplete: false,
      isQuickCheck: Boolean(o.isQuickCheck),
      source,
      externalOrderId: o.externalOrderId ?? null,
      events: eventsByOrder.get(o.id) ?? [],
      total: tyinToSom(o.totalAmountTiyin),
    };
  });

  return {
    data,
    isLoading: result.isLoading,
    isError: Boolean(result.error),
    error: result.error,
    hasNextPage: data.length === CHECKS_PAGE_SIZE && Boolean(result.pageInfo?.orders?.hasNextPage),
  };
}

export function useInstantCheckDetail(orderId: string) {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminOrderDetailQuery(venueId, orderId));
  const order = result.data?.orders?.[0];
  const items: CheckItem[] = (order?.items ?? []).map(item => {
    const product = instantOne(item.product);
    return {
      name: item.productName,
      qty: item.quantity,
      price: tyinToSom(item.productPriceTiyin),
      productId: product?.id ?? null,
      unitCost: product?.costTiyin != null ? tyinToSom(product.costTiyin) : null,
      modifiers: (item.modifiers ?? []).map(modifier => ({
        name: modifier.modifierName,
        price: tyinToSom(modifier.modifierPriceTiyin),
      })),
    };
  });
  const events: OrderEvent[] = (order?.orderEvents ?? []).map(event => {
    const meta = event.metadata as Record<string, unknown> | undefined;
    return {
      id: event.id,
      action: event.action,
      productName: (meta?.productName as string) ?? null,
      quantity: (meta?.quantity as number) ?? null,
      unitPrice: (meta?.unitPrice as number) ?? null,
      occurredAt: new Date(event.occurredAt).toISOString(),
    };
  });
  const { profit, incomplete: profitIncomplete } = profitFromItems(items);
  return { items, events, profit, profitIncomplete, isLoading: result.isLoading, error: result.error };
}
