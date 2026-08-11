import { useCallback, useState } from 'react';
import { executeAdminCommand } from '@/data/adminCommands';
import { useVenueId } from './useVenueId';

export function useInstantUpdateShift() {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);

  const update = useCallback(async (id: string, patch: {
    openedAt?: string;
    closedAt?: string;
    startingCashTiyin?: number;
    countedCashTiyin?: number | null;
    openingNote?: string | null;
    closingNote?: string | null;
  }) => {
    setLoading(true);
    try {
      await executeAdminCommand(
        'update-shift',
        crypto.randomUUID(),
        venueId,
        {
          shiftId: id,
          patch: {
            ...(patch.openedAt !== undefined ? { openedAt: new Date(patch.openedAt).toISOString() } : {}),
            ...(patch.closedAt !== undefined ? { closedAt: new Date(patch.closedAt).toISOString() } : {}),
            ...(patch.startingCashTiyin !== undefined ? { startingCashTiyin: patch.startingCashTiyin } : {}),
            ...(patch.countedCashTiyin !== undefined ? { countedCashTiyin: patch.countedCashTiyin } : {}),
            ...(patch.openingNote !== undefined ? { openingNote: patch.openingNote } : {}),
            ...(patch.closingNote !== undefined ? { closingNote: patch.closingNote } : {}),
          },
        },
      );
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  return { update, loading };
}
