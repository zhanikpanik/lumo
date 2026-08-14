import { useMemo } from 'react';
import { getInstantClient, getVenueId } from '../data/instant';
import type { Order } from '../types';
import {
  mapAndSortOrders,
  mapOrderRow,
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

  return mapOrderRow(order as unknown as InstantOrderRow);
}
