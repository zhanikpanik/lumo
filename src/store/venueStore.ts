import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../utils/supabase';

export interface VenueTable {
  id: string;
  number: string;
  zone: string;
  capacity: number;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  size: string;
}

export interface VenueZone {
  id: string;
  name: string;
  tables: VenueTable[];
  cols: number;
  rows: number;
}

export type VenueType = 'restaurant' | 'takeaway';

interface VenueStoreState {
  venueId: string;
  zones: VenueZone[];
  waiters: { id: string; name: string; pin: string; role: string }[];
  venueType: VenueType;
  trackGuests: boolean;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number;
  fetchVenue: (force?: boolean) => Promise<void>;
}

import { VENUE_ID } from '../config';
const VENUE_TTL = 10 * 60 * 1000; // 10 minutes

export const useVenueStore = create<VenueStoreState>()(
  persist(
    (set, get) => ({
  venueId: VENUE_ID,
  zones: [],
  waiters: [],
  venueType: 'restaurant',
  trackGuests: false,
  isLoading: false,
  error: null,
  lastFetchedAt: 0,

  fetchVenue: async (force = false) => {
    const now = Date.now();
    if (!force && now - get().lastFetchedAt < VENUE_TTL && get().zones.length > 0) return;
    set({ isLoading: true, error: null });

    try {
      // Fetch all 4 tables in parallel
      const [
        { data: venueData },
        { data: zoneData, error: zoneError },
        { data: tableData, error: tableError },
        { data: userData, error: userError },
      ] = await Promise.all([
        supabase.from('venues').select('track_guests, venue_type').eq('id', VENUE_ID).single(),
        supabase.from('zones').select('id, name, grid_cols, grid_rows, sort_order').eq('venue_id', VENUE_ID).order('sort_order'),
        supabase.from('tables').select('id, zone_id, number, capacity, col, row, col_span, row_span, size').eq('venue_id', VENUE_ID),
        supabase.from('users').select('id, name, pin, role, user_venues!inner(venue_id)').eq('user_venues.venue_id', VENUE_ID),
      ]);

      const trackGuests = venueData?.track_guests ?? false;
      const venueType: VenueType = venueData?.venue_type === 'takeaway' ? 'takeaway' : 'restaurant';

      if (zoneError) throw zoneError;
      if (tableError) throw tableError;
      if (userError) throw userError;

      // Build zones with tables
      const zones: VenueZone[] = (zoneData || []).map((z: any) => ({
        id: z.id,
        name: z.name,
        cols: z.grid_cols,
        rows: z.grid_rows,
        tables: (tableData || [])
          .filter((t: any) => t.zone_id === z.id)
          .map((t: any) => ({
            id: t.id,
            number: t.number,
            zone: z.name,
            capacity: t.capacity,
            col: t.col,
            row: t.row,
            colSpan: t.col_span || 2,
            rowSpan: t.row_span || 2,
            size: t.size || 'square',
          })),
      }));

      const waiters = (userData || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        pin: u.pin,
        role: u.role,
      }));

      set({ zones, waiters, venueType, trackGuests, isLoading: false, lastFetchedAt: Date.now() });
    } catch (err: any) {
      console.error('Failed to fetch venue:', err.message);
      set({ error: err.message, isLoading: false });
    }
  },
    }),
    {
      name: 'venue-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        zones: state.zones,
        waiters: state.waiters,
        venueType: state.venueType,
        trackGuests: state.trackGuests,
        lastFetchedAt: state.lastFetchedAt,
      }),
    },
  ),
);
