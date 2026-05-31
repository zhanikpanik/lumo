import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { VENUE_ID } from '../config';
import { finalizeOrderConsumption } from '../api/inventory';
import { recordConsumptionDeadLetter } from '../api/consumption';
import { useDeadLetterStore } from './deadLetterStore';
import { logger } from '../utils/logger';
import type { ConsumptionOutboxEvent, FinalizeOrderConsumptionPayload } from '../types/inventory';

const outboxStorageKey = `consumption_outbox_v1:${VENUE_ID}`;

// Escalation thresholds: after this many retries or after this much wall-clock
// time, we drop the event from local queue and register it in the server-side
// dead-letter table so other devices/admin can see and resolve it.
const MAX_RETRIES = 6;
const STALE_AGE_MS = 5 * 60 * 1000;

/**
 * Combine RPC error code with optional structured detail into a single,
 * human-readable string suitable for logs and for persisting to the
 * server-side `pos_consumption_dead_letters.last_error` column.
 *
 * Examples:
 *   "insufficient_stock"
 *   "insufficient_stock | warehouse_id=2374ee92… product_id=71980a7a… available=27 delta=-50"
 */
export const formatRpcError = (
  error: string | null | undefined,
  detail?: Record<string, unknown> | null,
): string => {
  const base = error ?? 'unknown';
  if (!detail) return base;
  const parts = Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  if (parts.length === 0) return base;
  return `${base} | ${parts.join(' ')}`;
};

interface SyncOutboxState {
  events: ConsumptionOutboxEvent[];
  syncing: boolean;
  lastError: string | null;
  hydrate: () => Promise<void>;
  enqueueConsumption: (payload: FinalizeOrderConsumptionPayload) => void;
  flush: () => Promise<void>;
  clearLastError: () => void;
}

export const useSyncOutboxStore = create<SyncOutboxState>((set, get) => ({
  events: [],
  syncing: false,
  lastError: null,

  clearLastError: () => set({ lastError: null }),

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(outboxStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { events?: ConsumptionOutboxEvent[] };
      if (Array.isArray(parsed.events)) set({ events: parsed.events });
    } catch (e) {
      logger.warn('outbox.hydrate.corrupt', 'AsyncStorage payload unreadable', {
        error: String(e),
      });
    }
  },

  enqueueConsumption: (payload) => {
    const idempotencyKey = payload.idempotencyKey;
    set((s) => {
      if (s.events.some((e) => e.idempotencyKey === idempotencyKey)) return s;
      const next: ConsumptionOutboxEvent = {
        idempotencyKey,
        payload,
        createdAt: new Date().toISOString(),
        retries: 0,
      };
      const events = [...s.events, next];
      void AsyncStorage.setItem(outboxStorageKey, JSON.stringify({ events }));
      return { events, lastError: null };
    });
  },

  flush: async () => {
    if (get().syncing) return;
    if (get().events.length === 0) return;

    set({ syncing: true, lastError: null });
    try {
      let events = [...get().events];
      let escalated = 0;
      while (events.length > 0) {
        const [head, ...tail] = events;
        const delay = head.retries > 0 ? Math.min(60_000, 400 * Math.pow(2, head.retries)) : 0;
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));

        const res = await finalizeOrderConsumption(head.payload);
        if (res.ok) {
          events = tail;
          set({ events });
          await AsyncStorage.setItem(outboxStorageKey, JSON.stringify({ events }));
          continue;
        }

        const detail = res.detail ?? undefined;
        const annotatedError = formatRpcError(res.error, detail);

        const bumped: ConsumptionOutboxEvent = {
          ...head,
          retries: head.retries + 1,
          lastError: res.error,
          lastDetail: detail,
        };

        const ageMs = Date.now() - new Date(bumped.createdAt).getTime();
        const isExhausted = bumped.retries >= MAX_RETRIES || ageMs >= STALE_AGE_MS;

        if (isExhausted) {
          // Hand off to server-side dead-letter. On success, drop from local
          // queue and continue processing the rest. On failure, keep retrying
          // locally (the next flush will try escalation again).
          const dl = await recordConsumptionDeadLetter({
            venueId: VENUE_ID,
            idempotencyKey: head.idempotencyKey,
            payload: head.payload,
            retries: bumped.retries,
            // Persist annotated error so the dead-letter modal shows the
            // concrete cause (warehouse/product/available/delta) without
            // needing schema changes.
            lastError: annotatedError,
          });

          if (dl.ok) {
            events = tail;
            set({ events });
            await AsyncStorage.setItem(outboxStorageKey, JSON.stringify({ events }));
            escalated += 1;
            logger.error('outbox.deadLetter', annotatedError, {
              idempotencyKey: head.idempotencyKey,
              orderId: head.payload.orderId,
              retries: bumped.retries,
              ageMs,
              detail,
            });
            continue;
          }

          logger.warn('outbox.deadLetter.recordFailed', dl.error, {
            idempotencyKey: head.idempotencyKey,
            orderId: head.payload.orderId,
          });
        }

        events = [bumped, ...tail];
        set({ events, lastError: annotatedError });
        await AsyncStorage.setItem(outboxStorageKey, JSON.stringify({ events }));
        logger.warn('outbox.flush.retry', annotatedError, {
          orderId: head.payload.orderId,
          retries: bumped.retries,
          detail,
        });
        break;
      }

      if (escalated > 0) {
        // Surface freshly registered dead-letters in UI immediately.
        await useDeadLetterStore.getState().refresh();
      }
    } finally {
      set({ syncing: false });
    }
  },
}));
