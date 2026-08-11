import { getInstantClient } from '@/data/instant';
import { adminWriteOffDetailQuery } from '@lumo/data';

export interface WriteOffRow {
  id: string;
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

const EMPTY = { writeOffDocuments: { $: { where: { id: '__none__' }, limit: 0 } } };

export function useInstantWriteOffRow(writeOffId: string | null) {
  const db = getInstantClient();
  const query = writeOffId
    ? adminWriteOffDetailQuery(writeOffId)
    : EMPTY;
  const result = db.useQuery(query);

  if (!writeOffId) return { data: null as WriteOffRow | null, isLoading: false };

  const raw = result.data?.writeOffDocuments?.[0];
  if (!raw) return { data: null as WriteOffRow | null, isLoading: result.isLoading };

  const rawRec = raw as Record<string, unknown>;
  const wh = (rawRec.warehouse ?? {}) as Record<string, unknown>;
  const linesRaw = (Array.isArray(rawRec.lines) ? rawRec.lines : []) as Record<string, unknown>[];

  const data: WriteOffRow = {
    id: raw.id,
    reason_summary: raw.reasonSummary,
    date: new Date(raw.writeOffDate).toISOString(),
    status: raw.status,
    created_by_name: raw.createdByName,
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
      reason: String(l.reason ?? ''),
    })),
  };

  return { data, isLoading: result.isLoading };
}
