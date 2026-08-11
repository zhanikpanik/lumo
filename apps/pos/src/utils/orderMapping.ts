/**
 * Pure mapping functions: InstantDB rows → app Order types.
 *
 * Extracted from useInstantOrders so they can be unit-tested
 * without mocking InstantDB.
 */
import type { Order, OrderItem, Modifier } from '../types';

// ── Raw InstantDB row shapes ─────────────────────────────

export interface InstantOrderRow {
  id: string; number?: string; status?: string; source?: string;
  ownerEmployee?: { displayName?: string };
  openedAt: string; closedAt?: string; zoneName?: string;
  orderType?: string; totalAmountTiyin?: number; tableNumber?: string;
  guestCount?: number; isQuickCheck?: boolean; comment?: string; closeReason?: string;
  items?: InstantOrderItemRow[];
  table?: { id: string }[];
}

export interface InstantOrderItemRow {
  id: string; product?: { id: string; name?: string; priceTiyin?: number };
  productName?: string; productPriceTiyin?: number;
  quantity?: number; comment?: string; modifiers?: InstantModifierRow[];
}

export interface InstantModifierRow {
  id: string; name?: string; priceTiyin?: number;
}

// ── Mapping ───────────────────────────────────────────────

/** Map a single InstantDB order row to the app Order type. */
export function mapOrderRow(o: InstantOrderRow): Order {
  return {
    id: o.id,
    number: o.number ?? '',
    status: (o.status ?? 'active') as Order['status'],
    source: (o.source as Order['source']) ?? 'pos',
    waiter: o.ownerEmployee?.displayName ?? 'Кассир',
    openedAt: o.openedAt,
    closedAt: o.closedAt ?? undefined,
    zone: o.zoneName ?? '',
    type: o.orderType ?? 'Общий',
    totalAmount: o.totalAmountTiyin ?? 0,
    tableNumber: o.tableNumber ?? '',
    tableId: o.table?.[0]?.id ?? '',
    guestCount: o.guestCount ?? 1,
    isQuickCheck: o.isQuickCheck ?? false,
    comment: o.comment ?? undefined,
    closeReason: o.closeReason ?? undefined,
    items: (o.items ?? []).map(mapItemRow),
  };
}

function mapItemRow(i: InstantOrderItemRow): OrderItem {
  return {
    id: i.id,
    product: {
      id: i.product?.id ?? '',
      categoryId: '',
      name: i.productName ?? i.product?.name ?? '',
      price: i.productPriceTiyin ?? i.product?.priceTiyin ?? 0,
    },
    quantity: i.quantity ?? 1,
    comment: i.comment ?? undefined,
    modifiers: (i.modifiers ?? []).map(mapModifierRow),
  };
}

function mapModifierRow(m: InstantModifierRow): Modifier {
  return {
    id: m.id,
    name: m.name ?? '',
    price: m.priceTiyin ?? 0,
  };
}

// ── Sorting ───────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = {
  active: 0,
  alert: 0,
  paid: 1,
  cancelled: 2,
};

/**
 * Sort orders: active/alert first, then paid, then cancelled.
 * Within each group, newest first (by openedAt).
 */
export function sortOrders(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 0;
    const pb = STATUS_PRIORITY[b.status] ?? 0;
    if (pa !== pb) return pa - pb;
    return new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime();
  });
}

/** map + sort in one call — the common path. */
export function mapAndSortOrders(rows: InstantOrderRow[]): Order[] {
  return sortOrders(rows.map(mapOrderRow));
}
