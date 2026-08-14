import { useMemo } from 'react';
import { getInstantClient, getVenueId } from '../data/instant';
import type { VenueZone, VenueTable, VenueType } from '../types';

const FLOOR_GRID_COLS = 24;
const FLOOR_GRID_ROWS = 14;

interface VenueEmployee {
  id: string;
  name: string;
  role: string;
  status: string;
}

export interface InstantVenueData {
  venueType: VenueType;
  trackGuests: boolean;
  zones: VenueZone[];
  employees: VenueEmployee[];
  isLoading: boolean;
  error: unknown;
}

/**
 * Live venue data from InstantDB. Replaces the imperative fetchVenue()
 * in venueStore with a reactive query — no polling, no TTL, no manual refresh.
 */
export function useInstantVenue(): InstantVenueData {
  const db = getInstantClient();
  const venueId = getVenueId();

  const { data, isLoading, error } = db.useQuery({
    venues: {
      $: { where: { id: venueId } },
      zones: {
        $: { order: { sortOrder: 'asc' } },
        tables: {},
      },
      employees: {},
    },
  });

  const venue = data?.venues?.[0];

  const zones: VenueZone[] = useMemo(() => {
    if (!venue?.zones) return [];
    return venue.zones
      .filter((z: any) => z.status !== 'archived')
      .map((z: any) => ({
        id: z.id,
        name: z.name,
        cols: Math.max(z.gridCols ?? 0, FLOOR_GRID_COLS),
        rows: Math.max(z.gridRows ?? 0, FLOOR_GRID_ROWS),
        tables: (z.tables ?? [])
          .filter((t: any) => t.status !== 'archived')
          .map((t: any): VenueTable => ({
            id: t.id,
            number: t.number,
            zone: z.name,
            capacity: t.capacity,
            col: t.col,
            row: t.row,
            colSpan: t.colSpan ?? 2,
            rowSpan: t.rowSpan ?? 2,
            size: t.size ?? 'square',
          })),
      }));
  }, [venue?.zones]);

  const employees: VenueEmployee[] = useMemo(() => {
    if (!venue?.employees) return [];
    return venue.employees
      .filter((e: any) => e.status === 'active')
      .map((e: any) => ({
        id: e.id,
        name: e.displayName,
        role: e.role,
        status: e.status,
      }));
  }, [venue?.employees]);

  return {
    venueType: (venue?.venueType as VenueType) ?? 'restaurant',
    trackGuests: venue?.trackGuests ?? false,
    zones,
    employees,
    isLoading,
    error,
  };
}
