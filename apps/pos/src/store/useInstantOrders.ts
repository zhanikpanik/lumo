import { useMemo } from 'react';
import { getInstantClient, getVenueId } from '../data/instant';
import type { Order } from '../types';
import {
  mapAndSortOrders,
  type InstantModifierRow,
  type InstantOrderItemRow,
  type InstantOrderRow,
} from '../utils/orderMapping';


/**
 * Live orders from InstantDB. Replaces the imperative loadOrdersFromSupabase()
 * in orderStore with a reactive query — no polling, no manual refresh.
 */
export function useInstantOrders(shiftId?: string) {
  const db = getInstantClient();
  const venueId = getVenueId();

  const { data, isLoading, error } = db.useQuery(
    shiftId
      ? {
          orders: {
            $: {
              where: {
                venue: venueId,
                shift: shiftId,
              },
              order: { openedAt: 'desc' },
            },
            items: {
              $: { order: { createdAt: 'asc' } },
              product: {},
              modifiers: {},
            },
            ownerEmployee: {},
            table: {},
          },
        }
      : null,
  );

  // Cast InstantDB query result — db.useQuery returns broad index-signature types.
  const rows = data as { orders?: InstantOrderRow[] } | undefined;

  const orders: Order[] = useMemo(() => {
    if (!rows?.orders) return [];
    return mapAndSortOrders(rows.orders);
  }, [rows?.orders]);

  return { orders, isLoading, error };
}

/** Single-order lookup from InstantDB — replaces orderStore.orders.find(). */
export function useInstantOrder(orderId?: string): Order | undefined {
  const db = getInstantClient();
  const { data } = db.useQuery(
    orderId
      ? {
          orders: {
            $: { where: { id: orderId } },
            items: {
              $: { order: { createdAt: 'asc' } },
              product: {},
              modifiers: {},
            },
            ownerEmployee: {},
            table: {},
          },
        }
      : null,
  );

  const order = data?.orders?.[0];
  if (!order) return undefined;

  return {
    id: order.id,
    number: order.number ?? '',
    status: (order.status as Order['status']) ?? 'active',
    source: (order.source as Order['source']) ?? 'pos',
    waiter: (order.ownerEmployee?.displayName as string) ?? 'Кассир',
    openedAt: order.openedAt as string,
    closedAt: order.closedAt as string | undefined ?? undefined,
    zone: (order.zoneName as string) ?? '',
    type: (order.orderType as string) ?? 'Общий',
    totalAmount: (order.totalAmountTiyin as number) ?? 0,
    tableNumber: (order.tableNumber as string) ?? '',
    guestCount: (order.guestCount as number) ?? 1,
    tableId: (order as any).table?.[0]?.id ?? '',
    isQuickCheck: (order.isQuickCheck as boolean) ?? false,
    comment: order.comment as string | undefined ?? undefined,
    closeReason: order.closeReason as string | undefined ?? undefined,
    sentToKitchen: false, // Not in InstantDB schema yet, default to false
    items: (order.items ?? []).map((i: InstantOrderItemRow) => ({
      id: i.id,
      product: {
        id: i.product?.id ?? '',
        categoryId: '',
        name: i.productName ?? i.product?.name ?? '',
        price: i.productPriceTiyin ?? i.product?.priceTiyin ?? 0,
      },
      quantity: i.quantity ?? 1,
      comment: i.comment ?? undefined,
      modifiers: (i.modifiers ?? []).map((m: InstantModifierRow) => ({
        id: m.id,
        name: m.name ?? '',
        price: m.priceTiyin ?? 0,
      })),
    })),
  };
}
