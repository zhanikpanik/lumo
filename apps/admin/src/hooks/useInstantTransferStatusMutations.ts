import { executeWarehouseCommand } from '@/data/warehouseCommands';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';

export function useInstantPostTransferBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(
    async (transferId: string) => {
      setLoading(true);
      try {
        await executeWarehouseCommand('post-transfer', crypto.randomUUID(), venueId, { documentId: transferId });
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutate, isPending: loading };
}

export function useInstantCancelTransferBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(
    async (transferId: string) => {
      setLoading(true);
      try {
        await executeWarehouseCommand('cancel-transfer', crypto.randomUUID(), venueId, { documentId: transferId });
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutate, isPending: loading };
}

export function useInstantRestoreTransferBridge() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(
    async (transferId: string) => {
      setLoading(true);
      try {
        await executeWarehouseCommand('restore-transfer', crypto.randomUUID(), venueId, { documentId: transferId });
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { mutate, isPending: loading };
}
