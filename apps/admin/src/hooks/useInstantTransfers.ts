import { getInstantClient } from '@/data/instant';
import {
  adminTransfersQuery,
  adminTransfersByWarehouseQuery,
  type TransferSnapshot,
} from '@lumo/data';
import { useVenueId } from './useVenueId';
import { instantRecord } from '@/lib/instantLink';

export interface InstantTransfer {
  id: string;
  operationId: string;
  transferDate: string;
  status: string;
  comment: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  lineCount: number;
  createdAt: string;
}

export interface InstantTransferDetail extends InstantTransfer {
  lines: InstantTransferLine[];
}

export interface InstantTransferLine {
  id: string;
  name: string;
  quantityMilli: number;
  unit: string;
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

export function useInstantTransfers(warehouseId?: string, limit = 50) {
  const db = getInstantClient();
  const venueId = useVenueId();

  const query = warehouseId
    ? adminTransfersByWarehouseQuery(warehouseId, limit)
    : adminTransfersQuery(venueId, limit);

  const result = db.useQuery(query);

  const data: InstantTransfer[] = (result.data?.transferDocuments ?? []).map(
    (t) => ({
      id: t.id,
      operationId: t.operationId,
      transferDate: toDate(t.transferDate),
      status: t.status,
      comment: t.comment ?? '',
      fromWarehouseId: linkedId((t as Record<string, unknown>).fromWarehouse),
      fromWarehouseName: linkedName((t as Record<string, unknown>).fromWarehouse),
      toWarehouseId: linkedId((t as Record<string, unknown>).toWarehouse),
      toWarehouseName: linkedName((t as Record<string, unknown>).toWarehouse),
      lineCount: Array.isArray((t as Record<string, unknown>).lines)
        ? ((t as Record<string, unknown>).lines as unknown[]).length
        : 0,
      createdAt: toDate(t.createdAt),
    }),
  );

  return { data, isLoading: result.isLoading, error: result.error };
}

const EMPTY_TRANSFER_QUERY = {
  transferDocuments: { $: { where: { id: '__none__' }, limit: 0 } },
};

export function useInstantTransferDetail(transferId: string | null) {
  const db = getInstantClient();

  const detailQuery = transferId
    ? {
        transferDocuments: {
          $: { where: { id: transferId } },
          fromWarehouse: {},
          toWarehouse: {},
          venue: {},
          lines: { product: {} },
        },
      }
    : EMPTY_TRANSFER_QUERY;

  const result = db.useQuery(detailQuery);

  const raw = result.data?.transferDocuments?.[0];
  if (!raw) {
    return { data: null, isLoading: result.isLoading, error: result.error };
  }

  const rawRec = raw as Record<string, unknown>;
  const linesRaw = (Array.isArray(rawRec.lines) ? rawRec.lines : []) as Record<string, unknown>[];

  const data: InstantTransferDetail = {
    id: raw.id,
    operationId: raw.operationId,
    transferDate: toDate(raw.transferDate),
    status: raw.status,
    comment: (raw.comment as string) ?? '',
    fromWarehouseId: linkedId(rawRec.fromWarehouse),
    fromWarehouseName: linkedName(rawRec.fromWarehouse),
    toWarehouseId: linkedId(rawRec.toWarehouse),
    toWarehouseName: linkedName(rawRec.toWarehouse),
    lineCount: linesRaw.length,
    createdAt: toDate(raw.createdAt),
    lines: linesRaw.map((l) => ({
      id: String(l.id),
      name: String(l.name),
      quantityMilli: Number(l.quantityMilli),
      unit: String(l.unit),
      productId: linkedId(l.product),
      productName: linkedName(l.product),
    })),
  };

  return { data, isLoading: result.isLoading, error: result.error };
}

export function toTransferSnapshot(detail: InstantTransferDetail): TransferSnapshot {
  return {
    fromWarehouseId: detail.fromWarehouseId,
    toWarehouseId: detail.toWarehouseId,
    status: detail.status,
    lines: detail.lines.map((l) => ({
      productId: l.productId,
      quantityMilli: l.quantityMilli,
      unit: l.unit,
    })),
  };
}
