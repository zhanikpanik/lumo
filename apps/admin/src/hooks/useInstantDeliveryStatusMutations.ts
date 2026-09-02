import { executeWarehouseCommand } from '@/data/warehouseCommands';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';
import type { ReceiveDeliveryInput } from '@lumo/data';


export function useInstantReceiveDeliveryBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(
    async (input: ReceiveDeliveryInput) => {
      setLoading(true);
      try {
        await executeWarehouseCommand('receive-delivery', crypto.randomUUID(), venueId, input);
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutate, isPending: loading };
}

export function useInstantCancelDeliveryBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(
    async (deliveryId: string) => {
      setLoading(true);
      try {
        await executeWarehouseCommand('cancel-delivery', crypto.randomUUID(), venueId, { documentId: deliveryId });
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutate, isPending: loading };
}

export function useInstantRestoreDeliveryBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(
    async (deliveryId: string) => {
      setLoading(true);
      try {
        await executeWarehouseCommand('restore-delivery', crypto.randomUUID(), venueId, { documentId: deliveryId });
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutate, isPending: loading };
}
