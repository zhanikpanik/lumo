import { getInstantClient } from '@/data/instant';
import { adminWriteOffsQuery } from '@lumo/data';
import { useVenueId } from '@/hooks/useVenueId';
import { instantRecord } from '@/lib/instantLink';

export interface WriteOffRow {
  id: string;
  version: number;
  reason_summary: string;
  date: string;
  status: string;
  created_by_name: string;
  comment: string;
  warehouse_id: string | null;
  warehouse_name: string;
  workshop_id: string | null;
  items: { id: string; product_id: string | null; name: string; quantity: number; unit: string; reason: string }[];
}

export function useInstantWriteOffsList() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminWriteOffsQuery(venueId, 200));

  const data: WriteOffRow[] = (result.data?.writeOffDocuments ?? []).map((w) => {
    const rec = w as Record<string, unknown>;
    const wh = instantRecord(rec.warehouse) ?? {};
    const lines = (Array.isArray(rec.lines) ? rec.lines : []) as Record<string, unknown>[];
    return {
      id: w.id,
      version: w.version,
      reason_summary: w.reasonSummary,
      date: new Date(w.writeOffDate).toISOString(),
      status: w.status,
      created_by_name: w.createdByName,
      comment: (w.comment as string) ?? '',
      warehouse_id: (wh.id as string) ?? null,
      warehouse_name: (wh.name as string) ?? '',
      workshop_id: null,
      items: lines.map((l) => ({
        id: String(l.id),
        product_id: String(instantRecord(l.product)?.id ?? ''),
        name: String(l.name),
        quantity: Number(l.quantityMilli) / 1000,
        unit: String(l.unit),
        reason: String(l.reason ?? ''),
      })),
    };
  });

  return { data, isLoading: result.isLoading, error: result.error };
}
