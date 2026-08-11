import { getInstantClient } from '@/data/instant';
import {
  adminInventorySessionsQuery,
  adminInventorySessionsByWarehouseQuery,
  type InventorySessionSnapshot,
} from '@lumo/data';
import { useVenueId } from './useVenueId';

export interface InstantInventorySession {
  id: string;
  operationId: string;
  inventoryType: string;
  conductedAt: string;
  status: string;
  resultDeltaTiyin: number;
  warehouseId: string;
  warehouseName: string;
  lineCount: number;
  createdAt: string;
}

export interface InstantInventorySessionDetail extends InstantInventorySession {
  lines: InstantInventoryLine[];
}

export interface InstantInventoryLine {
  id: string;
  name: string;
  unit: string;
  theoreticalMilli: number;
  actualMilli: number;
  unitPriceTiyin: number;
  productId: string;
  productName: string;
}

function toDate(v: string | number): string {
  return new Date(v).toISOString();
}

function linkedId(entity: unknown): string {
  return entity && typeof entity === 'object' ? String((entity as Record<string, unknown>).id ?? '') : '';
}

function linkedName(entity: unknown): string {
  return entity && typeof entity === 'object' ? String((entity as Record<string, unknown>).name ?? '') : '';
}

export function useInstantInventorySessions(warehouseId?: string, limit = 20) {
  const db = getInstantClient();
  const venueId = useVenueId();

  const query = warehouseId
    ? adminInventorySessionsByWarehouseQuery(warehouseId, limit)
    : adminInventorySessionsQuery(venueId, limit);

  const result = db.useQuery(query);

  const data: InstantInventorySession[] = (
    result.data?.inventorySessions ?? []
  ).map((s) => ({
    id: s.id,
    operationId: s.operationId,
    inventoryType: s.inventoryType,
    conductedAt: toDate(s.conductedAt),
    status: s.status,
    resultDeltaTiyin: s.resultDeltaTiyin,
    warehouseId: linkedId((s as Record<string, unknown>).warehouse),
    warehouseName: linkedName((s as Record<string, unknown>).warehouse),
    lineCount: 0,
    createdAt: toDate(s.createdAt),
  }));

  return { data, isLoading: result.isLoading, error: result.error };
}

const EMPTY_SESSION_QUERY = {
  inventorySessions: { $: { where: { id: '__none__' }, limit: 0 } },
};

export function useInstantInventorySessionDetail(sessionId: string | null) {
  const db = getInstantClient();

  const detailQuery = sessionId
    ? {
        inventorySessions: {
          $: { where: { id: sessionId } },
          warehouse: {},
          venue: {},
          lines: { product: {} },
        },
      }
    : EMPTY_SESSION_QUERY;

  const result = db.useQuery(detailQuery);

  const raw = result.data?.inventorySessions?.[0];
  if (!raw) {
    return { data: null, isLoading: result.isLoading, error: result.error };
  }

  const rawRec = raw as Record<string, unknown>;
  const linesRaw = (Array.isArray(rawRec.lines) ? rawRec.lines : []) as Record<string, unknown>[];

  const lines: InstantInventoryLine[] = linesRaw.map((l) => ({
    id: String(l.id),
    name: String(l.name),
    unit: String(l.unit),
    theoreticalMilli: Number(l.theoreticalMilli),
    actualMilli: Number(l.actualMilli),
    unitPriceTiyin: Number(l.unitPriceTiyin),
    productId: linkedId(l.product),
    productName: linkedName(l.product),
  }));

  const data: InstantInventorySessionDetail = {
    id: raw.id,
    operationId: raw.operationId,
    inventoryType: raw.inventoryType,
    conductedAt: toDate(raw.conductedAt),
    status: raw.status,
    resultDeltaTiyin: raw.resultDeltaTiyin,
    warehouseId: linkedId(rawRec.warehouse),
    warehouseName: linkedName(rawRec.warehouse),
    lineCount: lines.length,
    createdAt: toDate(raw.createdAt),
    lines,
  };

  return { data, isLoading: result.isLoading, error: result.error };
}

export function toInventorySessionSnapshot(
  detail: InstantInventorySessionDetail,
): InventorySessionSnapshot {
  return {
    warehouseId: detail.warehouseId,
    status: detail.status,
    lines: detail.lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      unit: l.unit,
      theoreticalMilli: l.theoreticalMilli,
      actualMilli: l.actualMilli,
      unitPriceTiyin: l.unitPriceTiyin,
    })),
  };
}
