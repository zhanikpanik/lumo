import { getInstantClient } from '@/data/instant';
import { adminTransferDetailQuery } from '@lumo/data';

export interface TransferRow {
  id: string;
  date: string;
  status: string;
  comment: string;
  fromWarehouseId: string | null;
  fromWorkshopId: string | null;
  toWarehouseId: string | null;
  toWorkshopId: string | null;
  from_warehouse_name: string;
  to_warehouse_name: string;
  items: { id: string; product_id: string | null; name: string; quantity: number; unit: string }[];
}

const EMPTY = { transferDocuments: { $: { where: { id: '__none__' }, limit: 0 } } };

export function useInstantTransferRow(transferId: string | null) {
  const db = getInstantClient();
  const query = transferId
    ? adminTransferDetailQuery(transferId)
    : EMPTY;
  const result = db.useQuery(query);

  if (!transferId) return { data: null as TransferRow | null, isLoading: false };

  const raw = result.data?.transferDocuments?.[0];
  if (!raw) return { data: null as TransferRow | null, isLoading: result.isLoading };

  const rawRec = raw as Record<string, unknown>;
  const fromWh = (rawRec.fromWarehouse ?? {}) as Record<string, unknown>;
  const toWh = (rawRec.toWarehouse ?? {}) as Record<string, unknown>;
  const linesRaw = (Array.isArray(rawRec.lines) ? rawRec.lines : []) as Record<string, unknown>[];

  const data: TransferRow = {
    id: raw.id,
    date: new Date(raw.transferDate).toISOString(),
    status: raw.status,
    comment: (raw.comment as string) ?? '',
    fromWarehouseId: (fromWh.id as string) ?? null,
    fromWorkshopId: null,
    toWarehouseId: (toWh.id as string) ?? null,
    toWorkshopId: null,
    from_warehouse_name: (fromWh.name as string) ?? '',
    to_warehouse_name: (toWh.name as string) ?? '',
    items: linesRaw.map((l) => ({
      id: String(l.id),
      product_id: String(((l.product ?? {}) as Record<string, unknown>).id ?? null),
      name: String(l.name),
      quantity: Number(l.quantityMilli) / 1000,
      unit: String(l.unit),
    })),
  };

  return { data, isLoading: result.isLoading };
}
