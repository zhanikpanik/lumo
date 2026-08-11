import { getInstantClient } from '@/data/instant';
import { adminWarehousesQuery } from '@lumo/data';
import { useVenueId } from './useVenueId';

export interface InstantWarehouse {
  id: string;
  name: string;
  productCount: number;
  createdAt: string;
}

export function useInstantWarehouses() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminWarehousesQuery(venueId));

  const data: InstantWarehouse[] = (result.data?.warehouses ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    productCount: (w as any).products?.length ?? 0,
    createdAt: new Date(w.createdAt).toISOString(),
  }));

  return { data, isLoading: result.isLoading, error: result.error };
}
