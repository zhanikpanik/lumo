import type { InstaQLParams } from '@instantdb/core';
import type { AppSchema } from './instant.schema.js';

/**
 * Warehouse query factories. All document queries default to cursor-based
 * pagination (limit + descending createdAt). Use stockItems queries for
 * current inventory snapshots (no pagination — ingredient count is bounded).
 */

// ── Warehouses ──

/** All warehouses for a venue with their linked products. */
export function adminWarehousesQuery(venueId: string) {
  return {
    warehouses: {
      $: { where: { 'venue.id': venueId } },
      products: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

// ── Stock items ──

/** Current stock for a single warehouse — all stockItems with product details. */
export function stockItemsByWarehouseQuery(warehouseId: string) {
  return {
    stockItems: {
      $: { where: { 'warehouse.id': warehouseId } },
      product: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

// ── Deliveries ──

/** All delivery documents for a venue, newest first. */
export function adminDeliveriesQuery(venueId: string, limit = 50) {
  return {
    deliveryDocuments: {
      $: {
        where: { 'venue.id': venueId },
        order: { createdAt: 'desc' as const },
        limit,
      },
      warehouse: {},
      lines: { product: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** Deliveries scoped to one warehouse, cursor-paginated. */
export function adminDeliveriesByWarehouseQuery(
  warehouseId: string,
  limit = 50,
  cursor?: string,
) {
  const $: Record<string, unknown> = {
    where: { 'warehouse.id': warehouseId },
    order: { createdAt: 'desc' as const },
    limit,
  };
  if (cursor) $.after = cursor;

  return {
    deliveryDocuments: {
      $,
      warehouse: {},
      lines: { product: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** Single delivery with all lines and linked products. */
export function adminDeliveryDetailQuery(deliveryId: string) {
  return {
    deliveryDocuments: {
      $: { where: { id: deliveryId } },
      warehouse: {},
      venue: {},
      lines: { product: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

// ── Write-offs ──

/** All write-off documents for a venue, newest first. */
export function adminWriteOffsQuery(venueId: string, limit = 50) {
  return {
    writeOffDocuments: {
      $: {
        where: { 'venue.id': venueId },
        order: { createdAt: 'desc' as const },
        limit,
      },
      warehouse: {},
      lines: { product: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** Write-offs scoped to one warehouse, cursor-paginated. */
export function adminWriteOffsByWarehouseQuery(
  warehouseId: string,
  limit = 50,
  cursor?: string,
) {
  const $: Record<string, unknown> = {
    where: { 'warehouse.id': warehouseId },
    order: { createdAt: 'desc' as const },
    limit,
  };
  if (cursor) $.after = cursor;

  return {
    writeOffDocuments: {
      $,
      warehouse: {},
      lines: { product: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** Single write-off with all lines and linked products. */
export function adminWriteOffDetailQuery(writeOffId: string) {
  return {
    writeOffDocuments: {
      $: { where: { id: writeOffId } },
      warehouse: {},
      venue: {},
      lines: { product: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

// ── Transfers ──

/** All transfer documents for a venue, newest first. */
export function adminTransfersQuery(venueId: string, limit = 50) {
  return {
    transferDocuments: {
      $: {
        where: { 'venue.id': venueId },
        order: { createdAt: 'desc' as const },
        limit,
      },
      fromWarehouse: {},
      toWarehouse: {},
      lines: { product: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** Transfers scoped to one warehouse (incoming or outgoing), cursor-paginated. */
export function adminTransfersByWarehouseQuery(
  warehouseId: string,
  limit = 50,
  cursor?: string,
) {
  // Match transfers where the warehouse is either the source or destination.
  // InstantDB doesn't support OR in where, so the caller combines two queries.
  const $: Record<string, unknown> = {
    where: { 'fromWarehouse.id': warehouseId },
    order: { createdAt: 'desc' as const },
    limit,
  };
  if (cursor) $.after = cursor;

  return {
    transferDocuments: {
      $,
      fromWarehouse: {},
      toWarehouse: {},
      lines: { product: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** Single transfer with all lines and linked products. */
export function adminTransferDetailQuery(transferId: string) {
  return {
    transferDocuments: {
      $: { where: { id: transferId } },
      fromWarehouse: {},
      toWarehouse: {},
      venue: {},
      lines: { product: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

// ── Inventory sessions ──

/** All inventory sessions for a venue, newest first. */
export function adminInventorySessionsQuery(venueId: string, limit = 20) {
  return {
    inventorySessions: {
      $: {
        where: { 'venue.id': venueId },
        order: { createdAt: 'desc' as const },
        limit,
      },
      warehouse: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** Inventory sessions scoped to one warehouse, cursor-paginated. */
export function adminInventorySessionsByWarehouseQuery(
  warehouseId: string,
  limit = 20,
  cursor?: string,
) {
  const $: Record<string, unknown> = {
    where: { 'warehouse.id': warehouseId },
    order: { createdAt: 'desc' as const },
    limit,
  };
  if (cursor) $.after = cursor;

  return {
    inventorySessions: {
      $,
      warehouse: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}

/** Single inventory session with all lines and linked products. */
export function adminInventorySessionDetailQuery(sessionId: string) {
  return {
    inventorySessions: {
      $: { where: { id: sessionId } },
      warehouse: {},
      venue: {},
      lines: { product: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

// ── Inventory movements (period) ──

/** Inventory movements for a venue in a date range, cursor-paginated. */
export function adminInventoryMovementsQuery(
  venueId: string,
  fromDate: string,
  toDate: string,
  limit = 200,
  cursor?: string,
) {
  const $: Record<string, unknown> = {
    where: {
      'venue.id': venueId,
      occurredAt: { $gte: fromDate, $lte: toDate },
    },
    order: { occurredAt: 'desc' as const },
    limit,
  };
  if (cursor) $.after = cursor;

  return {
    inventoryMovements: {
      $,
      product: {},
    },
  } satisfies InstaQLParams<AppSchema>;
}
