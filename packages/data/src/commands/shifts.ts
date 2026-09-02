import type { CommandDatabase } from './database.js';
import { DomainError, guardShiftState } from '../errors.js';
import { deterministicId } from '../ids.js';

export interface OpenShiftInput {
  operationId: string;
  venueId: string;
  deviceId: string;
  actorEmployeeId: string;
  startingCashTiyin: number;
  clientTimestamp: string;
}

export interface CloseShiftInput {
  operationId: string;
  venueId: string;
  shiftId: string;
  countedCashTiyin: number;
  closingNote?: string;
  clientTimestamp: string;
}

export interface ShiftState {
  id: string;
  status: string;
  openedAt: string | Date;
  closedAt?: string | Date | null;
}

export function selectCurrentOpenShift<T extends ShiftState>(shifts: readonly T[]): T | null {
  let current: T | null = null;
  let currentOpenedAt = Number.NEGATIVE_INFINITY;
  for (const shift of shifts) {
    if (shift.status !== 'open' || shift.closedAt != null) continue;
    const openedAt = new Date(shift.openedAt).getTime();
    if (!Number.isFinite(openedAt) || openedAt <= currentOpenedAt) continue;
    current = shift;
    currentOpenedAt = openedAt;
  }
  return current;
}

/** Open a shift. Rejected if one is already open. */
export function openShift(
  db: CommandDatabase,
  input: OpenShiftInput,
) {
  return {
    async execute(currentShift: { id: string; status: string } | null | undefined) {
      const guard = guardShiftState(currentShift, 'open');
      if (guard) throw guard;

      const id = deterministicId('shift', input.operationId);
      const shift = {
        venueId: input.venueId,
        operationId: input.operationId,
        openedAt: input.clientTimestamp,
        startingCashTiyin: input.startingCashTiyin,
        status: 'open' as const,
        createdAt: input.clientTimestamp,
        version: 0,
      };

      const links: Record<string, string> = { venue: input.venueId, openedBy: input.actorEmployeeId, device: input.deviceId };

      await db.transact([
        db.tx.shifts[id]
          .update(shift)
          .link(links),
      ]);

      return { shiftId: id };
    },
  };
}

/** Close the open shift. */
export function closeShift(
  db: CommandDatabase,
  input: CloseShiftInput,
) {
  return {
    async execute(currentShift: { id: string; status: string } | null | undefined) {
      const guard = guardShiftState(currentShift, 'close');
      if (guard) throw guard;

      if (currentShift!.id !== input.shiftId) {
        throw new DomainError('Shift mismatch', 'shift_not_found');
      }

      await db.transact([
        db.tx.shifts[input.shiftId].update({
          status: 'closed',
          closedAt: input.clientTimestamp,
          countedCashTiyin: input.countedCashTiyin,
          closingNote: input.closingNote,
        }),
      ]);

      return { shiftId: input.shiftId, status: 'closed' as const };
    },
  };
}
