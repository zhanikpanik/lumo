import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CurrentUser {
  id: string;
  name: string;
  role: string;
}

interface UserStoreState {
  currentUser: CurrentUser | null;
  setCurrentUser: (user: CurrentUser) => void;
  logout: () => void;
}

/**
 * Minimal store for device-scoped user identity.
 * Shift data (openShift, totals, payments) comes from useInstantShift —
 * this store holds only the authenticated employee, which is pure client state.
 */
export const useUserStore = create<UserStoreState>()(
  persist(
    (set) => ({
      currentUser: null,
      setCurrentUser: (user: CurrentUser) => set({ currentUser: user }),
      logout: () => set({ currentUser: null }),
    }),
    {
      name: 'user-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ currentUser: state.currentUser }),
    },
  ),
);
