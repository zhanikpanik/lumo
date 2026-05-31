import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Shift } from '../types';
import { supabase } from '../utils/supabase';
import { VENUE_ID } from '../config';
import {
  closeShiftOnServer,
  fetchShiftCashSummary,
  recordCashCollection,
  recordCashTransaction,
} from '../api/shift';
import { logger } from '../utils/logger';
import { useNotificationStore } from './notificationStore';

const generateId = () => Crypto.randomUUID();

interface CurrentUser {
  id: string;
  name: string;
  role: string;
}

interface ShiftStoreState {
  currentUser: CurrentUser | null;
  currentShift: Shift | null;
  shiftHistory: Shift[];
  lastSyncError: string | null;
  isSyncing: boolean;

  setCurrentUser: (user: CurrentUser) => void;
  logout: () => void;
  openShift: (startingCash: number) => void;
  closeShift: (countedCash?: number) => Promise<Shift | null>;
  recordPayment: (method: 'cash' | 'card' | 'other', amount: number) => void;
  refreshShiftCashSummary: () => Promise<void>;
  addCashCollection: (amount: number, note?: string) => Promise<{ ok: boolean; error?: string }>;
  addCashTransaction: (
    kind: 'in' | 'out',
    amount: number,
    note?: string,
    actorUserId?: string | null,
  ) => Promise<{ ok: boolean; error?: string; detail?: Record<string, unknown> }>;
  isShiftOpen: () => boolean;
  fetchOpenShift: () => Promise<boolean>;
  clearSyncError: () => void;
  retryShiftSync: () => Promise<void>;
}

const toShift = (raw: any): Shift => ({
  id: raw.id,
  cashier: raw.cashier,
  openedAt: raw.openedAt instanceof Date ? raw.openedAt : new Date(raw.openedAt),
  closedAt: raw.closedAt ? (raw.closedAt instanceof Date ? raw.closedAt : new Date(raw.closedAt)) : undefined,
  startingCash: raw.startingCash,
  countedCash: raw.countedCash != null ? Number(raw.countedCash) : undefined,
  expectedCash: raw.expectedCash != null ? Number(raw.expectedCash) : undefined,
  cashDifference: raw.cashDifference != null ? Number(raw.cashDifference) : undefined,
  cashCollectionsTotal: raw.cashCollectionsTotal != null ? Number(raw.cashCollectionsTotal) : 0,
  cashFloatIn: raw.cashFloatIn != null ? Number(raw.cashFloatIn) : 0,
  cashFloatOut: raw.cashFloatOut != null ? Number(raw.cashFloatOut) : 0,
  totalOrders: raw.totalOrders || 0,
  totalRevenue: raw.totalRevenue || 0,
  cashPayments: raw.cashPayments || 0,
  cashTotal: raw.cashTotal || 0,
  cardPayments: raw.cardPayments || 0,
  cardTotal: raw.cardTotal || 0,
  otherPayments: raw.otherPayments || 0,
  otherTotal: raw.otherTotal || 0,
});

const mapSupabaseShift = (row: any, cashierName?: string): Shift => ({
  id: row.id,
  cashier: cashierName || 'Кассир',
  openedAt: new Date(row.opened_at),
  startingCash: Number(row.starting_cash),
  totalOrders: row.total_orders || 0,
  totalRevenue: Number(row.total_revenue) || 0,
  cashPayments: 0,
  cashTotal: Number(row.cash_total) || 0,
  cardPayments: 0,
  cardTotal: Number(row.card_total) || 0,
  otherPayments: 0,
  otherTotal: Number(row.other_total) || 0,
  expectedCash:
    row.expected_cash_at_close != null
      ? Number(row.expected_cash_at_close)
      : Number(row.starting_cash) + (Number(row.cash_total) || 0),
  cashDifference:
    row.cash_difference_at_close != null
      ? Number(row.cash_difference_at_close)
      : undefined,
  cashCollectionsTotal: Number(row.cash_collections_total) || 0,
});

const applySummaryToShift = (shift: Shift, summary?: any): Shift => {
  if (!summary) return shift;
  return {
    ...shift,
    expectedCash:
      summary.expected_cash != null
        ? Number(summary.expected_cash)
        : shift.expectedCash,
    cashCollectionsTotal:
      summary.cash_collections != null
        ? Number(summary.cash_collections)
        : shift.cashCollectionsTotal,
    cashFloatIn:
      summary.cash_float_in != null
        ? Number(summary.cash_float_in)
        : shift.cashFloatIn,
    cashFloatOut:
      summary.cash_float_out != null
        ? Number(summary.cash_float_out)
        : shift.cashFloatOut,
  };
};

export const useShiftStore = create<ShiftStoreState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      currentShift: null,
      shiftHistory: [],
      lastSyncError: null,
      isSyncing: false,

      setCurrentUser: (user: CurrentUser) => set({ currentUser: user }),

      logout: () => set({ currentUser: null, currentShift: null }),

      openShift: (startingCash: number) => {
        const { currentUser, currentShift } = get();
        if (currentShift) return;

        // Per-venue model: if another device already has an open shift, attach to it.
        supabase
          .from('shifts')
          .select('*')
          .eq('venue_id', VENUE_ID)
          .is('closed_at', null)
          .order('opened_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) {
              logger.error('shift.openShift.fetchExisting', error.message);
              set({ lastSyncError: error.message, isSyncing: false });
              return;
            }

            if (data) {
              set({ currentShift: mapSupabaseShift(data, currentUser?.name), lastSyncError: null, isSyncing: false });
              void get().refreshShiftCashSummary();
              return;
            }

            const shift: Shift = {
              id: generateId(),
              cashier: currentUser?.name || 'Неизвестный',
              openedAt: new Date(),
              startingCash,
              totalOrders: 0,
              totalRevenue: 0,
              cashPayments: 0,
              cashTotal: 0,
              cardPayments: 0,
              cardTotal: 0,
              otherPayments: 0,
              otherTotal: 0,
              expectedCash: startingCash,
              cashCollectionsTotal: 0,
            };
            set({ currentShift: shift, lastSyncError: null, isSyncing: true });

            supabase
              .from('shifts')
              .insert({
                id: shift.id,
                venue_id: VENUE_ID,
                cashier_id: currentUser?.id || null,
                opened_at: shift.openedAt.toISOString(),
                starting_cash: startingCash,
              })
              .then(({ error: insertError }) => {
                if (insertError) {
                  logger.error('shift.openShift.sync', insertError.message);
                  set({ lastSyncError: insertError.message, isSyncing: false });
                } else {
                  set({ lastSyncError: null, isSyncing: false });
                  void get().refreshShiftCashSummary();
                }
              });
          });
      },

      closeShift: async (countedCash?: number) => {
        const { currentShift } = get();
        if (!currentShift) return null;
        if (countedCash == null) return null;

        set({ isSyncing: true });
        const result = await closeShiftOnServer(VENUE_ID, currentShift.id, countedCash);
        if (!result.ok) {
          const message = result.error ?? 'close_shift_failed';
          logger.error('shift.closeShift.rpc', message, { shiftId: currentShift.id });
          set({ lastSyncError: message, isSyncing: false });
          return null;
        }

        const payload = result.payload ?? {};
        const expectedCash = Number(payload.expected_cash ?? currentShift.expectedCash ?? 0);
        const difference = Number(payload.difference ?? countedCash - expectedCash);
        const closedShift: Shift = {
          ...currentShift,
          closedAt: new Date(),
          countedCash,
          expectedCash,
          cashDifference: difference,
          totalOrders: Number(payload.total_orders ?? currentShift.totalOrders),
          totalRevenue: Number(payload.total_revenue ?? currentShift.totalRevenue),
          cashTotal: Number(payload.cash_total ?? currentShift.cashTotal),
          cardTotal: Number(payload.card_total ?? currentShift.cardTotal),
          otherTotal: Number(payload.other_total ?? currentShift.otherTotal),
        };

        set((state) => ({
          currentShift: null,
          shiftHistory: [...state.shiftHistory, closedShift],
        }));
        set({ lastSyncError: null, isSyncing: false });

        useNotificationStore.getState().clearAll();

        return closedShift;
      },

      recordPayment: (method: 'cash' | 'card' | 'other', amount: number) => {
        const state = get();
        if (!state.currentShift) return;

        const shift = { ...state.currentShift };
        shift.totalOrders += 1;
        shift.totalRevenue += amount;

        if (method === 'cash') {
          shift.cashPayments += 1;
          shift.cashTotal += amount;
        } else if (method === 'card') {
          shift.cardPayments += 1;
          shift.cardTotal += amount;
        } else {
          shift.otherPayments += 1;
          shift.otherTotal += amount;
        }
        set({ currentShift: shift });

        // Keep shift totals synced in Supabase on each payment.
        set({ isSyncing: true });
        supabase
          .from('shifts')
          .update({
            total_orders: shift.totalOrders,
            total_revenue: shift.totalRevenue,
            cash_total: shift.cashTotal,
            card_total: shift.cardTotal,
            other_total: shift.otherTotal,
          })
          .eq('id', shift.id)
          .then(({ error }) => {
            if (error) {
              logger.error('shift.recordPayment.sync', error.message);
              set({ lastSyncError: error.message, isSyncing: false });
            } else {
              set({ lastSyncError: null, isSyncing: false });
              void get().refreshShiftCashSummary();
            }
          });
      },

      refreshShiftCashSummary: async () => {
        const shift = get().currentShift;
        if (!shift) return;
        const res = await fetchShiftCashSummary(VENUE_ID, shift.id);
        if (!res.ok) {
          if (res.error) {
            logger.warn('shift.summary.fetch', res.error, { shiftId: shift.id });
            set({ lastSyncError: res.error });
          }
          return;
        }
        set((state) => {
          if (!state.currentShift || state.currentShift.id !== shift.id) return state;
          return {
            ...state,
            currentShift: applySummaryToShift(state.currentShift, res.summary),
            lastSyncError: null,
          };
        });
      },

      addCashCollection: async (amount: number, note?: string) => {
        const shift = get().currentShift;
        if (!shift) return { ok: false, error: 'shift_not_open' };
        const res = await recordCashCollection(VENUE_ID, shift.id, amount, note);
        if (!res.ok) {
          const message = res.error ?? 'cash_collection_failed';
          logger.error('shift.cashCollection', message, { shiftId: shift.id, amount });
          set({ lastSyncError: message });
          return { ok: false, error: message };
        }
        set((state) => {
          if (!state.currentShift || state.currentShift.id !== shift.id) return state;
          return {
            ...state,
            currentShift: applySummaryToShift(state.currentShift, res.summary),
            lastSyncError: null,
          };
        });
        return { ok: true };
      },

      addCashTransaction: async (
        kind: 'in' | 'out',
        amount: number,
        note?: string,
        actorUserId?: string | null,
      ) => {
        const shift = get().currentShift;
        if (!shift) return { ok: false, error: 'shift_not_open' };
        const res = await recordCashTransaction(
          VENUE_ID,
          shift.id,
          kind,
          amount,
          note,
          actorUserId,
        );
        if (!res.ok) {
          const message = res.error ?? 'cash_transaction_failed';
          logger.warn('shift.cashTransaction', message, {
            shiftId: shift.id,
            kind,
            amount,
            detail: res.detail,
          });
          if (message !== 'insufficient_cash') {
            set({ lastSyncError: message });
          }
          return { ok: false, error: message, detail: res.detail };
        }
        set((state) => {
          if (!state.currentShift || state.currentShift.id !== shift.id) return state;
          return {
            ...state,
            currentShift: applySummaryToShift(state.currentShift, res.summary),
            lastSyncError: null,
          };
        });
        return { ok: true };
      },

      isShiftOpen: () => get().currentShift !== null,

      fetchOpenShift: async () => {
        try {
          const { data, error } = await supabase
            .from('shifts')
            .select('*')
            .eq('venue_id', VENUE_ID)
            .is('closed_at', null)
            .order('opened_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error || !data) return false;

          set({ currentShift: mapSupabaseShift(data), lastSyncError: null, isSyncing: false });
          void get().refreshShiftCashSummary();
          return true;
        } catch (e: any) {
          logger.error('shift.fetchOpenShift', e.message);
          set({ lastSyncError: e.message, isSyncing: false });
          return false;
        }
      },
      clearSyncError: () => set({ lastSyncError: null }),
      retryShiftSync: async () => {
        const shift = get().currentShift;
        if (!shift) return;
        set({ isSyncing: true });
        const { error } = await supabase
          .from('shifts')
          .update({
            total_orders: shift.totalOrders,
            total_revenue: shift.totalRevenue,
            cash_total: shift.cashTotal,
            card_total: shift.cardTotal,
            other_total: shift.otherTotal,
          })
          .eq('id', shift.id);
        if (error) {
          set({ lastSyncError: error.message, isSyncing: false });
        } else {
          set({ lastSyncError: null, isSyncing: false });
        }
      },
    }),
    {
      name: 'shift-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentShift: state.currentShift,
        shiftHistory: state.shiftHistory,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ShiftStoreState> | undefined;
        return {
          ...currentState,
          ...persisted,
          currentUser: null,
          currentShift: persisted?.currentShift ? toShift(persisted.currentShift) : null,
          shiftHistory: (persisted?.shiftHistory || []).map(toShift),
        };
      },
    },
  ),
);
