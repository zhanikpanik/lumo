import { executeWarehouseCommand } from '@/data/warehouseCommands';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';
import type { CreateDeliveryInput, UpdateDeliveryPatch } from '@lumo/data';

interface LegacyDeliveryPayload {
  supplier: string;
  date: string;
  comment?: string;
  warehouse_id?: string;
  items: { product_id: string; name: string; quantity: number; unit: string; price: number }[];
}

function toCreateInput(payload: LegacyDeliveryPayload, venueId: string, operationId: string): CreateDeliveryInput {
  const lines = payload.items.map((it) => ({
    productId: it.product_id,
    name: it.name,
    quantityMilli: Math.round(it.quantity * 1000),
    unit: it.unit,
    priceTiyin: Math.round(it.price * 100),
  }));
  const amountTiyin = lines.reduce((sum, l) => sum + l.quantityMilli * l.priceTiyin, 0);

  return {
    operationId,
    venueId,
    warehouseId: payload.warehouse_id ?? '',
    supplier: payload.supplier,
    deliveryDate: payload.date,
    amountTiyin,
    source: 'manual',
    comment: payload.comment,
    lines,
  };
}

export function useInstantCreateDeliveryBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutateAsync = useCallback(
    async (payload: LegacyDeliveryPayload) => {
      setLoading(true);
      try {
        const input = toCreateInput(payload, venueId, crypto.randomUUID());
        const result = await executeWarehouseCommand<{ deliveryId: string }>(
          'create-delivery', input.operationId, venueId, input,
        );
        return result.deliveryId;
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutateAsync, isPending: loading };
}

export function useInstantUpdateDeliveryBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutateAsync = useCallback(
    async (patch: { id: string; supplier?: string; date?: string; comment?: string; warehouse_id?: string; items?: LegacyDeliveryPayload['items'] }) => {
      setLoading(true);
      try {
        const operationId = crypto.randomUUID();
        const updatePatch: UpdateDeliveryPatch = {};
        if (patch.supplier !== undefined) updatePatch.supplier = patch.supplier;
        if (patch.date !== undefined) updatePatch.deliveryDate = patch.date;
        if (patch.comment !== undefined) updatePatch.comment = patch.comment;
        if (patch.items) {
          updatePatch.lines = patch.items.map((it) => ({
            productId: it.product_id,
            name: it.name,
            quantityMilli: Math.round(it.quantity * 1000),
            unit: it.unit,
            priceTiyin: Math.round(it.price * 100),
          }));
        }
        await executeWarehouseCommand(
          'update-delivery', operationId, venueId, { documentId: patch.id, patch: updatePatch },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutateAsync, isPending: loading };
}
