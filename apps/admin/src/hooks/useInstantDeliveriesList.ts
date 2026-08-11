import { getInstantClient } from '@/data/instant';
import { adminDeliveriesQuery } from '@lumo/data';
import { useVenueId } from '@/hooks/useVenueId';

/** Legacy DeliveryRow for AllOperations mergeOps compatibility. */
export interface DeliveryRow {
  id: string;
  supplier: string;
  date: string;
  amount: number;
  status: string;
  source: string;
  comment: string;
  warehouse_id: string | null;
  warehouse_name: string;
  workshop_id: string | null;
  items: { id: string; product_id: string | null; name: string; quantity: number; unit: string; price: number }[];
}

export function useInstantDeliveriesList() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminDeliveriesQuery(venueId, 200));

  const data: DeliveryRow[] = (result.data?.deliveryDocuments ?? []).map((d) => {
    const rec = d as Record<string, unknown>;
    const wh = (rec.warehouse ?? {}) as Record<string, unknown>;
    const lines = (Array.isArray(rec.lines) ? rec.lines : []) as Record<string, unknown>[];
    return {
      id: d.id,
      supplier: d.supplier,
      date: new Date(d.deliveryDate).toISOString(),
      amount: d.amountTiyin,
      status: d.status,
      source: d.source,
      comment: (d.comment as string) ?? '',
      warehouse_id: (wh.id as string) ?? null,
      warehouse_name: (wh.name as string) ?? '',
      workshop_id: null,
      items: lines.map((l) => ({
        id: String(l.id),
        product_id: String(((l.product ?? {}) as Record<string, unknown>).id ?? null),
        name: String(l.name),
        quantity: Number(l.quantityMilli) / 1000,
        unit: String(l.unit),
        price: Number(l.priceTiyin) / 100,
      })),
    };
  });

  return { data, isLoading: result.isLoading };
}
