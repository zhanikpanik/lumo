// Tracks "unseen" marketplace orders (Glovo / Yandex Eda) so the POS can show
// pulsing cards in OrdersScreen, a counter on the LockScreen, and play a sound
// when a new order arrives. Decoupled from realtime — anything that ingests an
// order can call addUnseen.

import { create } from 'zustand';
import { playNewOrderSound } from '../utils/notificationSound';

const SOUND_THROTTLE_MS = 2000;

interface NotificationState {
  unseenIds: Set<string>;
  lastSoundAt: number | null;
  /**
   * Mark a marketplace order as unseen. Triggers a chirp if we haven't played
   * one within the throttle window. Idempotent on the id.
   */
  addUnseen: (orderId: string, options?: { silent?: boolean }) => void;
  markSeen: (orderId: string) => void;
  clearAll: () => void;
  hasUnseen: (orderId: string) => boolean;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  unseenIds: new Set<string>(),
  lastSoundAt: null,
  addUnseen: (orderId, options) => {
    if (!orderId) return;
    const { unseenIds, lastSoundAt } = get();
    if (unseenIds.has(orderId)) return;
    const next = new Set(unseenIds);
    next.add(orderId);
    const now = Date.now();
    const shouldChirp =
      !options?.silent && (lastSoundAt == null || now - lastSoundAt >= SOUND_THROTTLE_MS);
    set({
      unseenIds: next,
      lastSoundAt: shouldChirp ? now : lastSoundAt,
    });
    if (shouldChirp) {
      playNewOrderSound();
    }
  },
  markSeen: (orderId) => {
    if (!orderId) return;
    const { unseenIds } = get();
    if (!unseenIds.has(orderId)) return;
    const next = new Set(unseenIds);
    next.delete(orderId);
    set({ unseenIds: next });
  },
  clearAll: () => {
    if (get().unseenIds.size === 0) return;
    set({ unseenIds: new Set<string>(), lastSoundAt: null });
  },
  hasUnseen: (orderId) => get().unseenIds.has(orderId),
}));
