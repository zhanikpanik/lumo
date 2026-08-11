import { executeWarehouseCommand } from '@/data/warehouseCommands';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';

export function useInstantPostWriteOffBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(
    async (writeOffId: string) => {
      setLoading(true);
      try {
        await executeWarehouseCommand('post-write-off', crypto.randomUUID(), venueId, { documentId: writeOffId });
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutate, isPending: loading };
}

export function useInstantCancelWriteOffBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(
    async (writeOffId: string) => {
      setLoading(true);
      try {
        await executeWarehouseCommand('cancel-write-off', crypto.randomUUID(), venueId, { documentId: writeOffId });
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutate, isPending: loading };
}

export function useInstantRestoreWriteOffBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(
    async (writeOffId: string) => {
      setLoading(true);
      try {
        await executeWarehouseCommand('restore-write-off', crypto.randomUUID(), venueId, { documentId: writeOffId });
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutate, isPending: loading };
}
