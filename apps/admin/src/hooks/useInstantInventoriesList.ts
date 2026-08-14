import { getInstantClient } from '@/data/instant';
import { adminInventorySessionsQuery } from '@lumo/data';
import { useVenueId } from '@/hooks/useVenueId';
import { instantRecord } from '@/lib/instantLink';

export interface InventoryActRow {
  id: string;
  date: string;
  workshop: string;
  warehouse: string;
  workshop_id: string | null;
  warehouse_id: string | null;
  result: number;
  status: string;
  inventory_type: string;
}

export function useInstantInventoriesList() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminInventorySessionsQuery(venueId, 200));

  const data: InventoryActRow[] = (result.data?.inventorySessions ?? []).map((s) => {
    const rec = s as Record<string, unknown>;
    const wh = instantRecord(rec.warehouse) ?? {};
    const whName = (wh.name as string) ?? '';
    return {
      id: s.id,
      date: new Date(s.conductedAt).toISOString(),
      workshop: '',
      warehouse: whName,
      workshop_id: null,
      warehouse_id: (wh.id as string) ?? null,
      result: s.resultDeltaTiyin,
      status: s.status,
      inventory_type: s.inventoryType,
    };
  });

  return { data, isLoading: result.isLoading };
}
