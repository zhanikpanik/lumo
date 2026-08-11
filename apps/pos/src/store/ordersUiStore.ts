import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type OrdersStatusFilter = 'all' | 'active' | 'paid';
export type OrdersSortMode = 'time' | 'table';

interface OrdersUiState {
  statusFilter: OrdersStatusFilter;
  sortMode: OrdersSortMode;
  setStatusFilter: (v: OrdersStatusFilter) => void;
  setSortMode: (v: OrdersSortMode) => void;
}

export const useOrdersUiStore = create<OrdersUiState>()(
  persist(
    (set) => ({
      statusFilter: 'all',
      sortMode: 'time',
      setStatusFilter: (v) => set({ statusFilter: v }),
      setSortMode: (v) => set({ sortMode: v }),
    }),
    {
      name: 'orders-ui',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        statusFilter: state.statusFilter,
        sortMode: state.sortMode,
      }),
    },
  ),
);
