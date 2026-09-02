import { executeWarehouseCommand } from '@/data/warehouseCommands';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';
import type { CreateWriteOffInput, UpdateWriteOffPatch, WriteOffSnapshot } from '@lumo/data';

export function useInstantCreateWriteOff() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const create = useCallback(
    async (input: Omit<CreateWriteOffInput, 'venueId'>) => {
      setLoading(true);
      try {
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

  return { create, loading };
}

export function useInstantUpdateWriteOff() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const update = useCallback(
    async (
      id: string,
      operationId: string,
      patch: UpdateWriteOffPatch,
      currentStatus?: string,
    ) => {
      setLoading(true);
      try {
        await executeWarehouseCommand(
          'update-write-off', operationId, venueId, { documentId: id, patch },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { update, loading };
}


export function useInstantCancelWriteOff() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const cancel = useCallback(
    async (writeOffId: string, _snapshot: WriteOffSnapshot) => {
      setLoading(true);
      try {
        await executeWarehouseCommand(
          'cancel-write-off', crypto.randomUUID(), venueId, { documentId: writeOffId },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { cancel, loading };
}
