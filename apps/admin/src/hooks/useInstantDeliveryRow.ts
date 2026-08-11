import { getInstantClient } from '@/data/instant';
import { adminDeliveryDetailQuery } from '@lumo/data';

/**
 * Bridge: wraps InstantDB delivery detail query, returns the legacy DeliveryRow shape
 * so existing NewDelivery.tsx form code stays unchanged.
 */

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

const EMPTY = { deliveryDocuments: { $: { where: { id: '__none__' }, limit: 0 } } };

export function useInstantDeliveryRow(deliveryId: string | null) {
  const db = getInstantClient();
  const query = deliveryId
    ? adminDeliveryDetailQuery(deliveryId)
    : EMPTY;
  const result = db.useQuery(query);

  if (!deliveryId) return { data: null as DeliveryRow | null, isLoading: false };

  const raw = result.data?.deliveryDocuments?.[0];
  if (!raw) return { data: null as DeliveryRow | null, isLoading: result.isLoading };

  const rawRec = raw as Record<string, unknown>;
  const wh = (rawRec.warehouse ?? {}) as Record<string, unknown>;
  const linesRaw = (Array.isArray(rawRec.lines) ? rawRec.lines : []) as Record<string, unknown>[];

  const data: DeliveryRow = {
    id: raw.id,
    supplier: raw.supplier,
    date: new Date(raw.deliveryDate).toISOString(),
    amount: raw.amountTiyin,
    status: raw.status,
    source: raw.source,
    comment: (raw.comment as string) ?? '',
    warehouse_id: (wh.id as string) ?? null,
    warehouse_name: (wh.name as string) ?? '',
    workshop_id: null,
    items: linesRaw.map((l) => ({
      id: String(l.id),
      product_id: String(((l.product ?? {}) as Record<string, unknown>).id ?? null),
      name: String(l.name),
      quantity: Number(l.quantityMilli) / 1000,
      unit: String(l.unit),
      price: Number(l.priceTiyin) / 100,
    })),
  };

  return { data, isLoading: result.isLoading };
}
