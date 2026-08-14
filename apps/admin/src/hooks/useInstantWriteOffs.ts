import { getInstantClient } from '@/data/instant';
import {
  adminWriteOffsQuery,
  adminWriteOffsByWarehouseQuery,
  type WriteOffSnapshot,
} from '@lumo/data';
import { useVenueId } from './useVenueId';
import { instantRecord } from '@/lib/instantLink';

export interface InstantWriteOff {
  id: string;
  operationId: string;
  reasonSummary: string;
  writeOffDate: string;
  status: string;
  createdByName: string;
  comment: string;
  warehouseId: string;
  warehouseName: string;
  lineCount: number;
  createdAt: string;
}

export interface InstantWriteOffDetail extends InstantWriteOff {
  lines: InstantWriteOffLine[];
}

export interface InstantWriteOffLine {
  id: string;
  name: string;
  quantityMilli: number;
  unit: string;
  reason: string;
  productId: string;
  productName: string;
}

function toDate(v: string | number): string {
  return new Date(v).toISOString();
}

function linkedId(entity: unknown): string {
  return String(instantRecord(entity)?.id ?? '');
}

function linkedName(entity: unknown): string {
  return String(instantRecord(entity)?.name ?? '');
}

export function useInstantWriteOffs(warehouseId?: string, limit = 50) {
  const db = getInstantClient();
  const venueId = useVenueId();

  const query = warehouseId
    ? adminWriteOffsByWarehouseQuery(warehouseId, limit)
    : adminWriteOffsQuery(venueId, limit);

  const result = db.useQuery(query);

  const data: InstantWriteOff[] = (result.data?.writeOffDocuments ?? []).map(
    (w) => ({
      id: w.id,
      operationId: w.operationId,
      reasonSummary: w.reasonSummary,
      writeOffDate: toDate(w.writeOffDate),
      status: w.status,
      createdByName: w.createdByName,
      comment: w.comment ?? '',
      warehouseId: linkedId((w as Record<string, unknown>).warehouse),
      warehouseName: linkedName((w as Record<string, unknown>).warehouse),
      lineCount: Array.isArray((w as Record<string, unknown>).lines)
        ? ((w as Record<string, unknown>).lines as unknown[]).length
        : 0,
      createdAt: toDate(w.createdAt),
    }),
  );

  return { data, isLoading: result.isLoading, error: result.error };
}

const EMPTY_WRITEOFF_QUERY = {
  writeOffDocuments: { $: { where: { id: '__none__' }, limit: 0 } },
};

export function useInstantWriteOffDetail(writeOffId: string | null) {
  const db = getInstantClient();

  const detailQuery = writeOffId
    ? {
        writeOffDocuments: {
          $: { where: { id: writeOffId } },
          warehouse: {},
          venue: {},
          lines: { product: {} },
        },
      }
    : EMPTY_WRITEOFF_QUERY;

  const result = db.useQuery(detailQuery);

  const raw = result.data?.writeOffDocuments?.[0];
  if (!raw) {
    return { data: null, isLoading: result.isLoading, error: result.error };
  }

  const rawRec = raw as Record<string, unknown>;
  const linesRaw = (Array.isArray(rawRec.lines) ? rawRec.lines : []) as Record<string, unknown>[];

  const data: InstantWriteOffDetail = {
    id: raw.id,
    operationId: raw.operationId,
    reasonSummary: raw.reasonSummary,
    writeOffDate: toDate(raw.writeOffDate),
    status: raw.status,
    createdByName: raw.createdByName,
    comment: (raw.comment as string) ?? '',
    warehouseId: linkedId(rawRec.warehouse),
    warehouseName: linkedName(rawRec.warehouse),
    lineCount: linesRaw.length,
    createdAt: toDate(raw.createdAt),
    lines: linesRaw.map((l) => ({
      id: String(l.id),
      name: String(l.name),
      quantityMilli: Number(l.quantityMilli),
      unit: String(l.unit),
      reason: String(l.reason ?? ''),
      productId: linkedId(l.product),
      productName: linkedName(l.product),
    })),
  };

  return { data, isLoading: result.isLoading, error: result.error };
}

export function toWriteOffSnapshot(detail: InstantWriteOffDetail): WriteOffSnapshot {
  return {
    warehouseId: detail.warehouseId,
    status: detail.status,
    lines: detail.lines.map((l) => ({
      productId: l.productId,
      quantityMilli: l.quantityMilli,
      unit: l.unit,
    })),
  };
}
