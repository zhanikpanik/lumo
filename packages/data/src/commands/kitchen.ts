import type { CommandDatabase } from './database.js';
import { deterministicId } from '../ids.js';
import type { PrintOutcome, TicketKind, TicketLineItem } from '../kitchen.js';

export interface CreateKitchenTicketInput {
  operationId: string;
  venueId: string;
  orderId: string;
  deviceId: string;
  actorEmployeeId: string;
  sequence: number;
  kind: TicketKind;
  orderItemIds: readonly string[];
  lines: TicketLineItem[];
  clientTimestamp: string;
}

export interface RecordPrintAttemptInput {
  ticketId: string;
  outcome: PrintOutcome;
  clientTimestamp: string;
}

/** Create an immutable kitchen ticket snapshot. */
export function createKitchenTicket(
  db: CommandDatabase,
  input: CreateKitchenTicketInput,
) {
  return {
    async execute() {
      const id = deterministicId('kitchen-ticket', input.operationId);
      const snapshot = { kind: input.kind, lines: input.lines };
      const now = input.clientTimestamp;

      await db.transact([
        db.tx.kitchenTickets[id]
          .update({
            venueId: input.venueId,
            operationId: input.operationId,
            sequence: input.sequence,
            kind: input.kind,
            status: 'queued',
            snapshotJson: JSON.stringify(snapshot),
            attemptCount: 0,
            createdAt: now,
          })
          .link({
            order: input.orderId,
            venue: input.venueId,
            actorEmployee: input.actorEmployeeId,
            device: input.deviceId,
          }),
        ...input.orderItemIds.map((orderItemId) =>
          db.tx.orderItems[orderItemId].update({ sentAt: now }),
        ),
      ]);

      return { ticketId: id, status: 'queued' as const };
    },
  };
}

/** Record a print outcome (queued → printing → printed | failed | uncertain). */
export function recordPrintOutcome(
  db: CommandDatabase,
  input: RecordPrintAttemptInput,
) {
  return {
    async execute() {
      const now = input.clientTimestamp;
      const status = input.outcome === 'printed' ? 'printed'
        : input.outcome === 'failed' ? 'failed'
        : 'uncertain';

      await db.transact([
        db.tx.kitchenTickets[input.ticketId].update({
          status,
          lastAttemptAt: now,
          ...(input.outcome === 'printed' || input.outcome === 'failed' ? { resolvedAt: now } : {}),
        }),
      ]);

      return { ticketId: input.ticketId, status: status as 'printed' | 'failed' | 'uncertain' };
    },
  };
}
