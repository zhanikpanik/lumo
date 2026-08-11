import { executeWarehouseCommand } from '@/data/warehouseCommands';
import { useVenueId } from './useVenueId';
import { useState, useCallback } from 'react';
import type {
  CreateInventorySessionInput,
  SaveInventoryLineInput,
  UpdateInventorySessionPatch,
  InventorySessionSnapshot,
} from '@lumo/data';

export function useInstantCreateInventorySession() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const create = useCallback(
    async (input: Omit<CreateInventorySessionInput, 'venueId'>) => {
      setLoading(true);
      try {
        const result = await executeWarehouseCommand<{ sessionId: string }>(
          'create-inventory', input.operationId, venueId, input,
        );
        return result.sessionId;
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { create, loading };
}

export function useInstantSaveInventoryLines() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const save = useCallback(
    async (sessionId: string, lines: SaveInventoryLineInput[]) => {
      setLoading(true);
      try {
        await executeWarehouseCommand(
          'save-inventory-lines', crypto.randomUUID(), venueId, { sessionId, lines },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { save, loading };
}

export function useInstantUpdateInventorySession() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const update = useCallback(
    async (
      id: string,
      patch: UpdateInventorySessionPatch,
      currentStatus?: string,
    ) => {
      setLoading(true);
      try {
        await executeWarehouseCommand(
          'update-inventory', crypto.randomUUID(), venueId, { sessionId: id, patch },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { update, loading };
}

export function useInstantPostInventorySession() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const post = useCallback(
    async (
      sessionId: string,
      _warehouseId: string,
      _snapshot: InventorySessionSnapshot,
    ) => {
      setLoading(true);
      try {
        await executeWarehouseCommand(
          'post-inventory', crypto.randomUUID(), venueId, { sessionId },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { post, loading };
}

export function useInstantCancelInventorySession() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const cancel = useCallback(
    async (sessionId: string, _currentStatus?: string) => {
      setLoading(true);
      try {
        await executeWarehouseCommand(
          'cancel-inventory', crypto.randomUUID(), venueId, { sessionId },
        );
      } finally {
        setLoading(false);
      }
    },
    [venueId],
  );

  return { cancel, loading };
}
