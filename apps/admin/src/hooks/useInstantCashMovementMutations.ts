import { useCallback, useState } from 'react';
import { executeAdminCommand } from '@/data/adminCommands';
import { useVenueId } from './useVenueId';
import type { NewTransaction } from './useInstantCashShifts';

export function useInstantAddCashMovement() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const add = useCallback(async (input: NewTransaction) => {
    if (!input.shift_id) throw new Error('Кассовая смена не найдена для этой транзакции');
    setLoading(true);
    try {
      const result = await executeAdminCommand<{ cashMovementId: string }>(
        'add-cash-movement',
        crypto.randomUUID(),
        venueId,
        {
          shiftId: input.shift_id,
          movementType: input.type,
          amountTiyin: Math.round(input.amount * 100),
          note: input.note || undefined,
          occurredAt: new Date(input.transaction_at).toISOString(),
        },
      );
      return result.cashMovementId;
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  return { add, loading };
}

export function useInstantDeleteCashMovement() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const remove = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await executeAdminCommand(
        'delete-cash-movement',
        crypto.randomUUID(),
        venueId,
        { cashMovementId: id },
      );
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  return { remove, loading };
}

export function useInstantUpdateCashMovement() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const update = useCallback(async (id: string, patch: {
    amount?: number;
    note?: string | null;
    transaction_at?: string;
  }) => {
    setLoading(true);
    try {
      await executeAdminCommand(
        'update-cash-movement',
        crypto.randomUUID(),
        venueId,
        {
          cashMovementId: id,
          patch: {
            ...(patch.amount !== undefined ? { amountTiyin: Math.round(patch.amount * 100) } : {}),
            ...(patch.note !== undefined ? { note: patch.note } : {}),
            ...(patch.transaction_at !== undefined
              ? { occurredAt: new Date(patch.transaction_at).toISOString() }
              : {}),
          },
        },
      );
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  return { update, loading };
}
