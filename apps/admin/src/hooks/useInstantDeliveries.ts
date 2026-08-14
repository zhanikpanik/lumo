import { getInstantClient } from '@/data/instant';
import {
  adminDeliveriesQuery,
  adminDeliveriesByWarehouseQuery,
  type DeliverySnapshot,
} from '@lumo/data';
import { useVenueId } from './useVenueId';
import { instantRecord } from '@/lib/instantLink';

export interface InstantDelivery {
  id: string;
  operationId: string;
  supplier: string;
  deliveryDate: string;
  amountTiyin: number;
  status: string;
  source: string;
  comment: string;
  warehouseId: string;
  warehouseName: string;
  lineCount: number;
  createdAt: string;
}

export interface InstantDeliveryDetail extends InstantDelivery {
  lines: InstantDeliveryLine[];
}

export interface InstantDeliveryLine {
  id: string;
  name: string;
  quantityMilli: number;
  unit: string;
  priceTiyin: number;
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

export function useInstantDeliveries(warehouseId?: string, limit = 50) {
  const db = getInstantClient();
  const venueId = useVenueId();

  const query = warehouseId
    ? adminDeliveriesByWarehouseQuery(warehouseId, limit)
    : adminDeliveriesQuery(venueId, limit);

  const result = db.useQuery(query);

  const data: InstantDelivery[] = (result.data?.deliveryDocuments ?? []).map(
    (d) => ({
      id: d.id,
      operationId: d.operationId,
      supplier: d.supplier,
      deliveryDate: toDate(d.deliveryDate),
      amountTiyin: d.amountTiyin,
      status: d.status,
      source: d.source,
      comment: d.comment ?? '',
      warehouseId: linkedId((d as Record<string, unknown>).warehouse),
      warehouseName: linkedName((d as Record<string, unknown>).warehouse),
      lineCount: Array.isArray((d as Record<string, unknown>).lines)
        ? ((d as Record<string, unknown>).lines as unknown[]).length
        : 0,
      createdAt: toDate(d.createdAt),
    }),
  );

  return { data, isLoading: result.isLoading, error: result.error };
}

/** Minimal query that returns no rows — used when deliveryId is null. */
const EMPTY_DELIVERY_QUERY = {
  deliveryDocuments: { $: { where: { id: '__none__' }, limit: 0 } },
};

export function useInstantDeliveryDetail(deliveryId: string | null) {
  const db = getInstantClient();

  const detailQuery = deliveryId
    ? {
        deliveryDocuments: {
          $: { where: { id: deliveryId } },
          warehouse: {},
          venue: {},
          lines: { product: {} },
        },
      }
    : EMPTY_DELIVERY_QUERY;

  const result = db.useQuery(detailQuery);

  const raw = result.data?.deliveryDocuments?.[0];
  if (!raw) {
    return { data: null, isLoading: result.isLoading, error: result.error };
  }

  const rawRec = raw as Record<string, unknown>;
  const linesRaw = (Array.isArray(rawRec.lines) ? rawRec.lines : []) as Record<string, unknown>[];

  const data: InstantDeliveryDetail = {
    id: raw.id,
    operationId: raw.operationId,
    supplier: raw.supplier,
    deliveryDate: toDate(raw.deliveryDate),
    amountTiyin: raw.amountTiyin,
    status: raw.status,
    source: raw.source,
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
      priceTiyin: Number(l.priceTiyin),
      productId: linkedId(l.product),
      productName: linkedName(l.product),
    })),
  };

  return { data, isLoading: result.isLoading, error: result.error };
}

/** Extract a DeliverySnapshot from a detail view for use with receiveDelivery/cancelDelivery commands. */
export function toDeliverySnapshot(detail: InstantDeliveryDetail): DeliverySnapshot {
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
