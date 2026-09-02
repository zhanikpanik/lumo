import type { CommandDatabase } from './database.js';
import { deterministicId } from '../ids.js';

// ═══ Shared types ═══════════════════════════════════════════════

export interface CreateLineInput {
  name: string;
  quantityMilli: number;
  unit: string;
  productId: string;
}

export interface DeliveryLineSnapshot {
  productId: string;
  quantityMilli: number;
  unit: string;
}

export interface DeliverySnapshot {
  warehouseId: string;
  status: string;
  lines: DeliveryLineSnapshot[];
}

export interface WriteOffLineSnapshot {
  productId: string;
  quantityMilli: number;
  unit: string;
}

export interface WriteOffSnapshot {
  warehouseId: string;
  status: string;
  lines: WriteOffLineSnapshot[];
}

export interface TransferLineSnapshot {
  productId: string;
  quantityMilli: number;
  unit: string;
}

export interface TransferSnapshot {
  fromWarehouseId: string;
  toWarehouseId: string;
  status: string;
  lines: TransferLineSnapshot[];
}

export interface InventoryLineSnapshot {
  productId: string;
  name: string;
  unit: string;
  theoreticalMilli: number;
  actualMilli: number;
  unitPriceTiyin: number;
}

export interface InventorySessionSnapshot {
  warehouseId: string;
  status: string;
  lines: InventoryLineSnapshot[];
}

// ═══ Warehouses ═════════════════════════════════════════════════

export interface CreateWarehouseInput {
  operationId: string;
  venueId: string;
  name: string;
}

export function createWarehouse(db: CommandDatabase, input: CreateWarehouseInput) {
  return {
    async execute() {
      const id = deterministicId('warehouse', input.operationId);
      await db.transact([
        db.tx.warehouses[id]
          .update({
            venueId: input.venueId,
            name: input.name,
            createdAt: new Date().toISOString(),
          })
          .link({ venue: input.venueId }),
      ]);
      return { warehouseId: id };
    },
  };
}

export interface UpdateWarehousePatch {
  name?: string;
}

export function updateWarehouse(db: CommandDatabase, id: string, patch: UpdateWarehousePatch) {
  return {
    async execute() {
      const fields: Record<string, string> = {};
      if (patch.name !== undefined) fields.name = patch.name;
      if (Object.keys(fields).length === 0) return;
      await db.transact([db.tx.warehouses[id].update(fields)]);
    },
  };
}

// ═══ Deliveries ════════════════════════════════════════════════

export interface CreateDeliveryLineInput extends CreateLineInput {
  priceTiyin: number;
}

export interface CreateDeliveryInput {
  operationId: string;
  venueId: string;
  warehouseId: string;
  supplier: string;
  deliveryDate: string;
  amountTiyin: number;
  source: string;
  comment?: string;
  lines: CreateDeliveryLineInput[];
}


export interface ReceiveDeliveryLineInput {
  productId: string;
  receivedQuantityMilli: number;
  receivedPriceTiyin: number;
}

export interface ReceiveDeliveryInput {
  documentId: string;
  expectedVersion: number;
  receivedLines?: ReceiveDeliveryLineInput[];
}

export interface UpdateDeliveryPatch {
  supplier?: string;
  deliveryDate?: string;
  amountTiyin?: number;
  comment?: string;
  lines?: CreateDeliveryLineInput[];
}



// ═══ Write-offs ═════════════════════════════════════════════════

export interface CreateWriteOffLineInput extends CreateLineInput {
  reason: string;
}

export interface CreateWriteOffInput {
  operationId: string;
  venueId: string;
  warehouseId: string;
  reasonSummary: string;
  writeOffDate: string;
  createdByName: string;
  comment?: string;
  lines: CreateWriteOffLineInput[];
}


export interface WarehouseLineQuantityInput {
  productId: string;
  quantityMilli: number;
}

export interface PostWriteOffInput {
  documentId: string;
  expectedVersion: number;
  lineQuantities?: WarehouseLineQuantityInput[];
}

export interface UpdateWriteOffPatch {
  reasonSummary?: string;
  writeOffDate?: string;
  comment?: string;
  lines?: CreateWriteOffLineInput[];
}



// ═══ Transfers ══════════════════════════════════════════════════

export interface CreateTransferLineInput extends CreateLineInput {}

export interface CreateTransferInput {
  operationId: string;
  venueId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  transferDate: string;
  comment?: string;
  lines: CreateTransferLineInput[];
}


export interface PostTransferInput {
  documentId: string;
  expectedVersion: number;
  lineQuantities?: WarehouseLineQuantityInput[];
}

export interface UpdateTransferPatch {
  transferDate?: string;
  comment?: string;
  lines?: CreateTransferLineInput[];
}



// ═══ Inventory sessions ═════════════════════════════════════════

export interface CreateInventorySessionInput {
  operationId: string;
  venueId: string;
  warehouseId: string;
  inventoryType: string;
  conductedAt: string;
}


export interface SaveInventoryLineInput {
  name: string;
  unit: string;
  theoreticalMilli: number;
  actualMilli: number;
  unitPriceTiyin: number;
  productId: string;
}


export interface UpdateInventorySessionPatch {
  inventoryType?: string;
  conductedAt?: string;
}


