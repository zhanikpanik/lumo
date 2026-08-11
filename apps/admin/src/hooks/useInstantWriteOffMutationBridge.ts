import { executeWarehouseCommand } from '@/data/warehouseCommands';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';
import type { CreateWriteOffInput, UpdateWriteOffPatch } from '@lumo/data';

interface LegacyWriteOffPayload {
  date: string;
  comment?: string;
  warehouse_id?: string;
  items: { product_id: string; name: string; quantity: number; unit: string; reason: string }[];
}

function toCreateInput(payload: LegacyWriteOffPayload, venueId: string, operationId: string): CreateWriteOffInput {
  const reasons = [...new Set(payload.items.map((i) => i.reason).filter(Boolean))];
  return {
    operationId,
    venueId,
    warehouseId: payload.warehouse_id ?? '',
    reasonSummary: reasons.join(', '),
    writeOffDate: payload.date,
    createdByName: 'Админ',
    comment: payload.comment,
    lines: payload.items.map((it) => ({
      productId: it.product_id,
      name: it.name,
      quantityMilli: Math.round(it.quantity * 1000),
      unit: it.unit,
      reason: it.reason,
    })),
  };
}

export function useInstantCreateWriteOffBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutateAsync = useCallback(
    async (payload: LegacyWriteOffPayload) => {
      setLoading(true);
      try {
        const input = toCreateInput(payload, venueId, crypto.randomUUID());
        const result = await executeWarehouseCommand<{ writeOffId: string }>(
          'create-write-off', input.operationId, venueId, input,
        );
        return result.writeOffId;
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutateAsync, isPending: loading };
}

export function useInstantUpdateWriteOffBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutateAsync = useCallback(
    async (patch: { id: string; reason_summary?: string; date?: string; comment?: string; warehouse_id?: string; items?: LegacyWriteOffPayload['items'] }) => {
      setLoading(true);
      try {
        const operationId = crypto.randomUUID();
        const updatePatch: UpdateWriteOffPatch = {};
        if (patch.reason_summary !== undefined) updatePatch.reasonSummary = patch.reason_summary;
        if (patch.date !== undefined) updatePatch.writeOffDate = patch.date;
        if (patch.comment !== undefined) updatePatch.comment = patch.comment;
        if (patch.items) {
          updatePatch.lines = patch.items.map((it) => ({
            productId: it.product_id,
            name: it.name,
            quantityMilli: Math.round(it.quantity * 1000),
            unit: it.unit,
            reason: it.reason,
          }));
        }
        await executeWarehouseCommand(
          'update-write-off', operationId, venueId, { documentId: patch.id, patch: updatePatch },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutateAsync, isPending: loading };
}
