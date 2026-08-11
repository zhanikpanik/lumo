import { executeWarehouseCommand } from '@/data/warehouseCommands';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';
import type { CreateTransferInput, UpdateTransferPatch } from '@lumo/data';

interface LegacyTransferPayload {
  date: string;
  comment?: string;
  from_warehouse_id?: string;
  to_warehouse_id?: string;
  items: { product_id: string; name: string; quantity: number; unit: string }[];
}

function toCreateInput(payload: LegacyTransferPayload, venueId: string, operationId: string): CreateTransferInput {
  return {
    operationId,
    venueId,
    fromWarehouseId: payload.from_warehouse_id ?? '',
    toWarehouseId: payload.to_warehouse_id ?? '',
    transferDate: payload.date,
    comment: payload.comment,
    lines: payload.items.map((it) => ({
      productId: it.product_id,
      name: it.name,
      quantityMilli: Math.round(it.quantity * 1000),
      unit: it.unit,
    })),
  };
}

export function useInstantCreateTransferBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutateAsync = useCallback(
    async (payload: LegacyTransferPayload) => {
      setLoading(true);
      try {
        const input = toCreateInput(payload, venueId, crypto.randomUUID());
        const result = await executeWarehouseCommand<{ transferId: string }>(
          'create-transfer', input.operationId, venueId, input,
        );
        return result.transferId;
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutateAsync, isPending: loading };
}

export function useInstantUpdateTransferBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutateAsync = useCallback(
    async (patch: { id: string; date?: string; comment?: string; from_warehouse_id?: string; to_warehouse_id?: string; items?: LegacyTransferPayload['items'] }) => {
      setLoading(true);
      try {
        const operationId = crypto.randomUUID();
        const updatePatch: UpdateTransferPatch = {};
        if (patch.date !== undefined) updatePatch.transferDate = patch.date;
        if (patch.comment !== undefined) updatePatch.comment = patch.comment;
        if (patch.items) {
          updatePatch.lines = patch.items.map((it) => ({
            productId: it.product_id,
            name: it.name,
            quantityMilli: Math.round(it.quantity * 1000),
            unit: it.unit,
          }));
        }
        await executeWarehouseCommand(
          'update-transfer', operationId, venueId, { documentId: patch.id, patch: updatePatch },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutateAsync, isPending: loading };
}
