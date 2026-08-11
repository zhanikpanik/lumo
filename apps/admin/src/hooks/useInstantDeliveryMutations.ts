import { executeWarehouseCommand } from '@/data/warehouseCommands';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';
import type { CreateDeliveryInput, UpdateDeliveryPatch, DeliverySnapshot } from '@lumo/data';

export function useInstantCreateDelivery() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const create = useCallback(
    async (input: Omit<CreateDeliveryInput, 'venueId'>) => {
      setLoading(true);
      try {
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

  return { create, loading };
}

export function useInstantUpdateDelivery() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const update = useCallback(
    async (
      id: string,
      operationId: string,
      patch: UpdateDeliveryPatch,
      currentStatus?: string,
    ) => {
      setLoading(true);
      try {
        await executeWarehouseCommand(
          'update-delivery', operationId, venueId, { documentId: id, patch },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { update, loading };
}

export function useInstantReceiveDelivery() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const receive = useCallback(
    async (deliveryId: string, _snapshot: DeliverySnapshot) => {
      setLoading(true);
      try {
        await executeWarehouseCommand(
          'receive-delivery', crypto.randomUUID(), venueId, { documentId: deliveryId },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { receive, loading };
}

export function useInstantCancelDelivery() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const cancel = useCallback(
    async (deliveryId: string, _snapshot: DeliverySnapshot) => {
      setLoading(true);
      try {
        await executeWarehouseCommand(
          'cancel-delivery', crypto.randomUUID(), venueId, { documentId: deliveryId },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { cancel, loading };
}
