import { useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { useOrderStore } from '../store/orderStore';
import { useNotificationStore } from '../store/notificationStore';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { VENUE_ID } from '../config';

const FRESH_ORDER_WINDOW_MS = 60_000;
const MARKETPLACE_SOURCES = new Set(['glovo', 'yandex_eda']);

let itemReloadTimer: ReturnType<typeof setTimeout> | null = null;
const pendingItemReloads = new Set<string>();

function scheduleItemReload(orderId: string, fetchOrders: () => Promise<void>) {
  pendingItemReloads.add(orderId);
  if (itemReloadTimer) clearTimeout(itemReloadTimer);
  itemReloadTimer = setTimeout(() => {
    pendingItemReloads.clear();
    fetchOrders();
  }, 300);
}

export function useOrderRealtime() {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const itemsChannelRef = useRef<RealtimeChannel | null>(null);
  const fetchOrders = useOrderStore((s) => s.fetchOrders);

  useEffect(() => {
    const ordersChannel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `venue_id=eq.${VENUE_ID}`,
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          const store = useOrderStore.getState();
          const currentOrderId = store.currentOrderId;

          if (eventType === 'INSERT') {
            const row = newRow as any;
            if (store.orders.find((o) => o.id === row.id)) return;

            // Mark new marketplace orders as unseen → triggers card pulse + sound.
            // Skip the initial historical backfill: only orders younger than
            // FRESH_ORDER_WINDOW_MS count as "just arrived" to avoid spamming.
            if (MARKETPLACE_SOURCES.has(row.order_source)) {
              const openedAtRaw = row.opened_at ?? row.created_at;
              const openedTs = openedAtRaw ? Date.parse(openedAtRaw) : NaN;
              const isFresh =
                !Number.isFinite(openedTs) || Date.now() - openedTs < FRESH_ORDER_WINDOW_MS;
              if (isFresh) {
                useNotificationStore.getState().addUnseen(row.id);
              }
            }

            fetchOrders();
          }

          if (eventType === 'UPDATE') {
            const updated = newRow as any;
            if (updated.id === currentOrderId) return;
            useOrderStore.setState((state) => ({
              orders: state.orders.map((o) =>
                o.id === updated.id
                  ? {
                      ...o,
                      status: updated.status,
                      totalAmount: Number(updated.total_amount),
                      tableNumber: updated.table_number || o.tableNumber,
                      tableId: updated.table_id || o.tableId,
                      closedAt: updated.closed_at || o.closedAt,
                      guestCount: updated.guest_count || o.guestCount,
                    }
                  : o,
              ),
            }));
          }

          if (eventType === 'DELETE') {
            const deletedId = (oldRow as any).id;
            if (deletedId === currentOrderId) return;
            useOrderStore.setState((state) => ({
              orders: state.orders.filter((o) => o.id !== deletedId),
            }));
          }
        },
      )
      .subscribe();

    // Live item updates from other devices — debounced full refetch
    const itemsChannel = supabase
      .channel('order-items-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items',
        },
        (payload) => {
          const row = (payload.new || payload.old) as any;
          const orderId = row?.order_id;
          if (!orderId) return;

          const store = useOrderStore.getState();
          // Don't reload items for the order we're currently editing
          if (orderId === store.currentOrderId) return;
          // Only care about orders we're tracking
          if (!store.orders.find((o) => o.id === orderId)) return;

          scheduleItemReload(orderId, fetchOrders);
        },
      )
      .subscribe();

    channelRef.current = ordersChannel;
    itemsChannelRef.current = itemsChannel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (itemsChannelRef.current) {
        supabase.removeChannel(itemsChannelRef.current);
        itemsChannelRef.current = null;
      }
      if (itemReloadTimer) clearTimeout(itemReloadTimer);
    };
  }, [fetchOrders]);
}
