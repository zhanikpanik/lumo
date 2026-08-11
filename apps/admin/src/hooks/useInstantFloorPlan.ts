import { useMemo } from 'react';
import { getInstantClient } from '@/data/instant';
import { adminZonesQuery } from '@lumo/data';
import { useVenueId } from './useVenueId';

export interface InstantTable {
  id: string;
  number: string;
  capacity: number;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  size: string;
  status: string;
}

export interface InstantZone {
  id: string;
  name: string;
  gridCols: number;
  gridRows: number;
  tables: InstantTable[];
}

export function useInstantFloorPlan() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminZonesQuery(venueId));

  const data: InstantZone[] = useMemo(() => (result.data?.zones ?? []).map(z => ({
    id: z.id,
    name: z.name,
    gridCols: z.gridCols,
    gridRows: z.gridRows,
    tables: (z.tables ?? []).map(t => ({
      id: t.id,
      number: t.number,
      capacity: t.capacity,
      col: t.col,
      row: t.row,
      colSpan: t.colSpan,
      rowSpan: t.rowSpan,
      size: t.size,
      status: t.status,
    })),
  })), [result.data]);

  return { data, isLoading: result.isLoading, error: result.error };
}
