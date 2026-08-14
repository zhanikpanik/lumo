import { getInstantClient } from '@/data/instant';
import { adminTransfersQuery } from '@lumo/data';
import { useVenueId } from '@/hooks/useVenueId';
import { instantRecord } from '@/lib/instantLink';

export interface TransferRow {
  id: string;
  fromWarehouse: string;
  fromWarehouseId: string;
  toWarehouse: string;
  toWarehouseId: string;
  date: string;
  status: string;
  comment: string;
  from_warehouse_name: string;
  to_warehouse_name: string;
  items: { id: string; product_id: string | null; name: string; quantity: number; unit: string }[];
}

export function useInstantTransfersList() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminTransfersQuery(venueId, 200));

  const data: TransferRow[] = (result.data?.transferDocuments ?? []).map((t) => {
    const rec = t as Record<string, unknown>;
    const fromWh = instantRecord(rec.fromWarehouse) ?? {};
    const toWh = instantRecord(rec.toWarehouse) ?? {};
    const fromName = (fromWh.name as string) ?? '';
    const toName = (toWh.name as string) ?? '';
    const lines = (Array.isArray(rec.lines) ? rec.lines : []) as Record<string, unknown>[];
    return {
      id: t.id,
      fromWarehouse: fromName,
      fromWarehouseId: (fromWh.id as string) ?? '',
      toWarehouse: toName,
      toWarehouseId: (toWh.id as string) ?? '',
      date: new Date(t.transferDate).toISOString(),
      status: t.status,
      comment: (t.comment as string) ?? '',
      from_warehouse_name: fromName,
      to_warehouse_name: toName,
      items: lines.map((l) => ({
        id: String(l.id),
        product_id: String(instantRecord(l.product)?.id ?? ''),
        name: String(l.name),
        quantity: Number(l.quantityMilli) / 1000,
        unit: String(l.unit),
      })),
    };
  });

  return { data, isLoading: result.isLoading };
}
