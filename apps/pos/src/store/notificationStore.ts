// Two concerns in one store:
// 1. Marketplace "unseen" orders (Glovo / Yandex Eda) — pulse cards, bell badge, sound
// 2. General notifications (shift ending, order stuck, low stock, subscription, sync error)

import { create } from 'zustand';
import { AppNotification, NotificationType } from '../types';
import { playNewOrderSound } from '../utils/notificationSound';

const SOUND_THROTTLE_MS = 2000;

let idCounter = 0;
const nextId = () => `notif_${Date.now()}_${++idCounter}`;

interface NotificationState {
  // ── Marketplace unseen ──
  unseenIds: Set<string>;
  lastSoundAt: number | null;
  addUnseen: (orderId: string, options?: { silent?: boolean }) => void;
  markSeen: (orderId: string) => void;
  clearAll: () => void;
  hasUnseen: (orderId: string) => boolean;

  // ── General notifications ──
  notifications: AppNotification[];
  unreadCount: number;
  add: (type: NotificationType, title: string, message: string, orderId?: string) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  // ── Marketplace unseen (unchanged) ──
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

  // ── General notifications ──
  notifications: [],
  unreadCount: 0,

  add: (type, title, message, orderId) => {
    const notif: AppNotification = {
      id: nextId(),
      type,
      title,
      message,
      orderId,
      createdAt: new Date().toISOString(),
      read: false,
    };
    set((s) => ({
      notifications: [notif, ...s.notifications],
      unreadCount: s.unreadCount + 1,
    }));
  },

  markAllRead: () => {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  markRead: (id) => {
    set((s) => {
      const notif = s.notifications.find((n) => n.id === id);
      if (!notif || notif.read) return s;
      return {
        notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        unreadCount: s.unreadCount - 1,
      };
    });
  },

  clear: () => set({ notifications: [], unreadCount: 0 }),

}));
