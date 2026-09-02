import { executeWarehouseCommand } from '@/data/warehouseCommands';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';
import type { CreateTransferInput, UpdateTransferPatch, TransferSnapshot } from '@lumo/data';

export function useInstantCreateTransfer() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const create = useCallback(
    async (input: Omit<CreateTransferInput, 'venueId'>) => {
      setLoading(true);
      try {
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

  return { create, loading };
}

export function useInstantUpdateTransfer() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const update = useCallback(
    async (
      id: string,
      operationId: string,
      patch: UpdateTransferPatch,
      currentStatus?: string,
    ) => {
      setLoading(true);
      try {
        await executeWarehouseCommand(
          'update-transfer', operationId, venueId, { documentId: id, patch },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { update, loading };
}


export function useInstantCancelTransfer() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const cancel = useCallback(
    async (transferId: string, _snapshot: TransferSnapshot) => {
      setLoading(true);
      try {
        await executeWarehouseCommand(
          'cancel-transfer', crypto.randomUUID(), venueId, { documentId: transferId },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { cancel, loading };
}
