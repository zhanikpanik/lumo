import { create } from 'zustand';
import { VENUE_ID } from '../config';
import {
  ackConsumptionDeadLetter,
  listConsumptionDeadLetters,
  retryConsumptionDeadLetter,
} from '../api/consumption';
import { logger } from '../utils/logger';
import type { ConsumptionDeadLetter } from '../types/inventory';

interface DeadLetterState {
  items: ConsumptionDeadLetter[];
  isLoading: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
  retry: (idempotencyKey: string) => Promise<boolean>;
  ack: (idempotencyKey: string, actorUserId: string | null) => Promise<boolean>;
}

export const useDeadLetterStore = create<DeadLetterState>((set, get) => ({
  items: [],
  isLoading: false,
  lastError: null,

  refresh: async () => {
    if (get().isLoading) return;
    set({ isLoading: true, lastError: null });
    try {
      const items = await listConsumptionDeadLetters(VENUE_ID);
      set({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown_error';
      set({ lastError: msg });
      logger.error('deadLetter.refresh', e);
    } finally {
      set({ isLoading: false });
    }
  },

  retry: async (idempotencyKey) => {
    const res = await retryConsumptionDeadLetter(idempotencyKey);
    if (!res.ok) {
      logger.warn('deadLetter.retry', res.error, { idempotencyKey });
      set({ lastError: res.error });
      // Keep the row visible with updated counters from server.
      await get().refresh();
      return false;
    }
    await get().refresh();
    return true;
  },

  ack: async (idempotencyKey, actorUserId) => {
    const res = await ackConsumptionDeadLetter(idempotencyKey, actorUserId);
    if (!res.ok) {
      logger.warn('deadLetter.ack', res.error, { idempotencyKey });
      set({ lastError: res.error });
      return false;
    }
    await get().refresh();
    return true;
  },
}));
