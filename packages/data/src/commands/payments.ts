import type { CommandDatabase } from './database.js';
import { DomainError, domainErrorFrom, guardActiveOrder } from '../errors.js';
import { deterministicId } from '../ids.js';
import { parseOrderLineSnapshot, serializeSnapshot } from '../snapshots.js';

export interface PayOrderInput {
  operationId: string;
  venueId: string;
  shiftId: string;
  orderId: string;
  deviceId: string;
  actorEmployeeId: string;
  method: 'cash' | 'card';
  /** Required for cash. This is tendered cash, not the sale amount. */
  tenderedCashTiyin?: number;
  clientTimestamp: string;
}

export interface PayableOrder {
  id: string;
  status: string;
  totalAmountTiyin: number;
  items: readonly {
    id: string;
    consumptionSnapshotJson: string;
  }[];
}

export interface PayOrderResult {
  paymentId: string;
  status: 'paid';
  changeTiyin: number;
}

/**
 * Atomically settles an order from its persisted line snapshots. The client
 * supplies the tender only; it cannot choose the sale amount or stock rows.
 */
export function payOrder(
  db: CommandDatabase,
  input: PayOrderInput,
  currentOrder: PayableOrder | undefined,
) {
  return {
    async execute(): Promise<PayOrderResult> {
      if (!currentOrder) {
        throw new DomainError(`Order ${input.orderId} was not found`, 'order_not_found');
      }

      const guard = guardActiveOrder(currentOrder.status, input.orderId);
      if (guard) throw guard;

      const amountTiyin = currentOrder.totalAmountTiyin;
      if (!Number.isSafeInteger(amountTiyin) || amountTiyin < 0) {
        throw new DomainError('Payment amount is invalid', 'invalid_payment_amount');
      }

      let tenderedCashTiyin = 0;
      if (input.method === 'cash') {
        tenderedCashTiyin = input.tenderedCashTiyin ?? amountTiyin;
        if (!Number.isSafeInteger(tenderedCashTiyin) || tenderedCashTiyin < amountTiyin) {
          throw new DomainError('Tendered cash is insufficient', 'invalid_payment_amount');
        }
      }
      const paymentId = input.orderId;
      const cashMovementId = deterministicId('cash-movement', paymentId);
      const fiscalReceiptId = paymentId;


      const orderEventId = deterministicId('order-event', input.orderId, 'paid');
      const changeTiyin = input.method === 'cash' ? tenderedCashTiyin - amountTiyin : 0;
      const now = input.clientTimestamp;

      let inventoryOps;
      let foodCostTiyin = 0;
      try {
        inventoryOps = currentOrder.items.flatMap((item) => {
          const parsed = parseOrderLineSnapshot(item.consumptionSnapshotJson);
          foodCostTiyin += parsed.consumption.reduce((s, c) => s + c.costTiyin, 0);
          return parsed.consumption.map((consumption) => {
            const movementId = deterministicId(
              'inventory-movement',
              input.orderId,
              item.id,
              consumption.ingredientId,
              'sale',
            );

            return db.tx.inventoryMovements[movementId]
              .update({
                venueId: input.venueId,
                operationId: movementId,
                quantityDeltaMilli: -consumption.quantityMilli,
                unit: consumption.unit,
                reason: 'sale',
                lineIdempotencyKey: movementId,
                occurredAt: now,
                createdAt: now,
              })
              .link({
                venue: input.venueId,
                product: consumption.ingredientId,
                order: input.orderId,
                payment: paymentId,
              });
          });
        });
      } catch (cause) {
        throw new DomainError(
          cause instanceof Error ? cause.message : 'Order consumption snapshot is invalid',
          'invalid_order_snapshot',
        );
      }

      if (!Number.isSafeInteger(foodCostTiyin) || foodCostTiyin < 0) {
        throw new DomainError(
          `Computed food cost is not a safe integer: ${foodCostTiyin}`,
          'invalid_food_cost',
        );
      }

      const paymentOps = [
        db.tx.payments[paymentId]
          .update({
            venueId: input.venueId,
            operationId: input.operationId,
            method: input.method,
            amountTiyin,
            changeTiyin,
            foodCostTiyin,
            fiscalStatus: 'pending',
            idempotencyKey: paymentId,
            createdAt: now,
          })
          .link({
            order: input.orderId,
            shift: input.shiftId,
            venue: input.venueId,
            actorEmployee: input.actorEmployeeId,
            device: input.deviceId,
          }),
        db.tx.orders[input.orderId].update({ status: 'paid', closedAt: now }),
        db.tx.fiscalReceipts[fiscalReceiptId]
          .update({
            venueId: input.venueId,
            operationId: input.operationId,
            status: 'pending',
            snapshotJson: serializeSnapshot({
              orderId: input.orderId,
              amountTiyin,
              changeTiyin,
              method: input.method,
            }),
            attemptCount: 0,
            createdAt: now,
          })
          .link({ payment: paymentId, venue: input.venueId }),
        db.tx.orderEvents[orderEventId]
          .update({
            venueId: input.venueId,
            operationId: input.operationId,
            action: 'paid',
            occurredAt: now,
            metadata: { paymentId, amountTiyin, changeTiyin, method: input.method },
          })
          .link({
            order: input.orderId,
            venue: input.venueId,
            actorEmployee: input.actorEmployeeId,
            device: input.deviceId,
          }),
      ];

      const cashOps = input.method === 'cash'
        ? [
          db.tx.cashMovements[cashMovementId]
            .update({
              venueId: input.venueId,
              operationId: input.operationId,
              movementType: 'sale',
              amountTiyin,
              occurredAt: now,
              createdAt: now,
            })
            .link({ shift: input.shiftId, venue: input.venueId, payment: paymentId, order: input.orderId }),
        ]
        : [];

      try {
        await db.transact([...paymentOps, ...cashOps, ...inventoryOps]);
        return { paymentId, status: 'paid', changeTiyin };
      } catch (cause) {
        throw domainErrorFrom(cause);
      }
    },
  };
}

// ═══ Refund ═════════════════════════════════════════════════════

export interface RefundOrderInput {
  operationId: string;
  venueId: string;
  /** The shift performing the refund (may differ from original payment shift). */
  shiftId: string;
  orderId: string;
  deviceId: string;
  actorEmployeeId: string;
  reason?: string;
  clientTimestamp: string;
}

export interface RefundableOrder {
  id: string;
  status: string;
  totalAmountTiyin: number;
  items: readonly {
    id: string;
    consumptionSnapshotJson: string;
  }[];
  payments: readonly {
    id: string;
    method: string;
    amountTiyin: number;
  }[];
}

export interface RefundOrderResult {
  refundPaymentId: string;
  status: 'refunded';
}

/**
 * Reverses a paid order: restores stock, creates refund payment, reopens order.
 * Atomic — all-or-nothing via single db.transact.
 */
export function refundOrder(
  db: CommandDatabase,
  input: RefundOrderInput,
  currentOrder: RefundableOrder | undefined,
) {
  return {
    async execute(): Promise<RefundOrderResult> {
      if (!currentOrder) {
        throw new DomainError(`Order ${input.orderId} was not found`, 'order_not_found');
      }
      if (currentOrder.status !== 'paid') {
        throw new DomainError(
          `Order ${input.orderId} is ${currentOrder.status}, expected paid`,
          'invalid_state_transition',
        );
      }

      const originalPayment = currentOrder.payments[0];
      if (!originalPayment) {
        throw new DomainError(`No payment found for order ${input.orderId}`, 'order_not_found');
      }

      const now = input.clientTimestamp;
      const refundPaymentId = deterministicId('refund-payment', input.orderId, input.operationId);
      const orderEventId = deterministicId('order-event', input.orderId, 'refunded', input.operationId);

      // ── Reverse inventory (restore stock) ──
      let inventoryOps: ReturnType<typeof db.tx.inventoryMovements[string]>['update'] extends (...args: unknown[]) => unknown ? ReturnType<typeof db.tx.inventoryMovements[string]['update']> extends Promise<unknown> ? never : ReturnType<typeof db.tx.inventoryMovements[string]['update']>[] : never;
      let foodCostTiyin = 0;
      try {
        const rawOps = currentOrder.items.flatMap((item) => {
          const parsed = parseOrderLineSnapshot(item.consumptionSnapshotJson);
          foodCostTiyin += parsed.consumption.reduce((s, c) => s + c.costTiyin, 0);
          return parsed.consumption.map((consumption) => {
            const movementId = deterministicId(
              'inventory-movement',
              input.orderId,
              item.id,
              consumption.ingredientId,
              'refund',
            );
            return db.tx.inventoryMovements[movementId]
              .update({
                venueId: input.venueId,
                operationId: movementId,
                quantityDeltaMilli: consumption.quantityMilli, // positive = restore
                unit: consumption.unit,
                reason: 'refund',
                lineIdempotencyKey: movementId,
                occurredAt: now,
                createdAt: now,
              })
              .link({
                venue: input.venueId,
                product: consumption.ingredientId,
                order: input.orderId,
                payment: refundPaymentId,
              });
          });
        });
        inventoryOps = rawOps as typeof inventoryOps;
      } catch (cause) {
        throw new DomainError(
          cause instanceof Error ? cause.message : 'Order consumption snapshot is invalid',
          'invalid_order_snapshot',
        );
      }

      // ── Refund payment record ──
      const paymentOps = [
        db.tx.payments[refundPaymentId]
          .update({
            venueId: input.venueId,
            operationId: input.operationId,
            method: 'refund',
            amountTiyin: originalPayment.amountTiyin,
            changeTiyin: 0,
            foodCostTiyin,
            fiscalStatus: 'none',
            idempotencyKey: refundPaymentId,
            closeReason: input.reason ?? '',
            createdAt: now,
          })
          .link({
            order: input.orderId,
            shift: input.shiftId,
            venue: input.venueId,
            actorEmployee: input.actorEmployeeId,
            device: input.deviceId,
          }),
        db.tx.orders[input.orderId].update({ status: 'active', closedAt: null }),
        db.tx.orderEvents[orderEventId]
          .update({
            venueId: input.venueId,
            operationId: input.operationId,
            action: 'refunded',
            occurredAt: now,
            metadata: {
              refundPaymentId,
              originalPaymentId: originalPayment.id,
              amountTiyin: originalPayment.amountTiyin,
              reason: input.reason ?? '',
            },
          })
          .link({
            order: input.orderId,
            venue: input.venueId,
            actorEmployee: input.actorEmployeeId,
            device: input.deviceId,
          }),
      ];

      // ── Cash movement (if original was cash) ──
      const cashOps = originalPayment.method === 'cash'
        ? [
          db.tx.cashMovements[deterministicId('cash-movement', refundPaymentId)]
            .update({
              venueId: input.venueId,
              operationId: input.operationId,
              movementType: 'refund',
              amountTiyin: -originalPayment.amountTiyin, // negative = cash out
              occurredAt: now,
              createdAt: now,
            })
            .link({ shift: input.shiftId, venue: input.venueId, payment: refundPaymentId, order: input.orderId }),
        ]
        : [];

      try {
        await db.transact([...paymentOps, ...cashOps, ...inventoryOps]);
        return { refundPaymentId, status: 'refunded' };
      } catch (cause) {
        throw domainErrorFrom(cause);
      }
    },
  };
}

// ═══ Cancel Refund ═══════════════════════════════════════════════

export interface CancelRefundInput {
  operationId: string;
  venueId: string;
  shiftId: string;
  orderId: string;
  deviceId: string;
  actorEmployeeId: string;
  clientTimestamp: string;
}

export interface CancelRefundResult {
  status: 'paid';
}

/**
 * Reverses a refund: re-consumes stock, re-closes the order.
 * Atomic — all-or-nothing via single db.transact.
 */
export function cancelRefund(
  db: CommandDatabase,
  input: CancelRefundInput,
  currentOrder: RefundableOrder | undefined,
) {
  return {
    async execute(): Promise<CancelRefundResult> {
      if (!currentOrder) {
        throw new DomainError(`Order ${input.orderId} was not found`, 'order_not_found');
      }
      if (currentOrder.status !== 'active') {
        throw new DomainError(
          `Order ${input.orderId} is ${currentOrder.status}, expected active (refunded)`,
          'invalid_state_transition',
        );
      }

      // Find the refund payment
      const refundPayment = currentOrder.payments.find((p) => p.method === 'refund');
      if (!refundPayment) {
        throw new DomainError(`No refund payment found for order ${input.orderId}`, 'order_not_found');
      }

      const now = input.clientTimestamp;
      const orderEventId = deterministicId('order-event', input.orderId, 'refund_cancelled', input.operationId);

      // ── Re-consume inventory (reverse the stock restoration) ──
      let inventoryOps: ReturnType<typeof db.tx.inventoryMovements[string]>['update'] extends (...args: unknown[]) => unknown ? ReturnType<typeof db.tx.inventoryMovements[string]['update']> extends Promise<unknown> ? never : ReturnType<typeof db.tx.inventoryMovements[string]['update']>[] : never;
      try {
        const rawOps = currentOrder.items.flatMap((item) => {
          const parsed = parseOrderLineSnapshot(item.consumptionSnapshotJson);
          return parsed.consumption.map((consumption) => {
            const movementId = deterministicId(
              'inventory-movement',
              input.orderId,
              item.id,
              consumption.ingredientId,
              'cancel_refund',
            );
            return db.tx.inventoryMovements[movementId]
              .update({
                venueId: input.venueId,
                operationId: movementId,
                quantityDeltaMilli: -consumption.quantityMilli, // negative = re-consume
                unit: consumption.unit,
                reason: 'cancel_refund',
                lineIdempotencyKey: movementId,
                occurredAt: now,
                createdAt: now,
              })
              .link({
                venue: input.venueId,
                product: consumption.ingredientId,
                order: input.orderId,
                payment: refundPayment.id,
              });
          });
        });
        inventoryOps = rawOps as typeof inventoryOps;
      } catch (cause) {
        throw new DomainError(
          cause instanceof Error ? cause.message : 'Order consumption snapshot is invalid',
          'invalid_order_snapshot',
        );
      }

      // ── Re-close order ──
      const paymentOps = [
        db.tx.orders[input.orderId].update({ status: 'paid', closedAt: now }),
        db.tx.orderEvents[orderEventId]
          .update({
            venueId: input.venueId,
            operationId: input.operationId,
            action: 'refund_cancelled',
            occurredAt: now,
            metadata: {
              refundPaymentId: refundPayment.id,
              amountTiyin: refundPayment.amountTiyin,
            },
          })
          .link({
            order: input.orderId,
            venue: input.venueId,
            actorEmployee: input.actorEmployeeId,
            device: input.deviceId,
          }),
      ];

      // ── Cash movement (if original was cash) ──
      const originalMethod = refundPayment.method === 'refund'
        ? currentOrder.payments.find((p) => p.method !== 'refund')?.method ?? 'cash'
        : 'cash';
      const cashOps = originalMethod === 'cash'
        ? [
          db.tx.cashMovements[deterministicId('cash-movement', refundPayment.id, 'cancel')]
            .update({
              venueId: input.venueId,
              operationId: input.operationId,
              movementType: 'cancel_refund',
              amountTiyin: refundPayment.amountTiyin, // positive = cash back in
              occurredAt: now,
              createdAt: now,
            })
            .link({ shift: input.shiftId, venue: input.venueId, payment: refundPayment.id, order: input.orderId }),
        ]
        : [];

      try {
        await db.transact([...paymentOps, ...cashOps, ...inventoryOps]);
        return { status: 'paid' };
      } catch (cause) {
        throw domainErrorFrom(cause);
      }
    },
  };
}

// ═══ Query helpers ═══════════════════════════════════════════════

/**
 * InstantDB query shape to find refunded orders for a shift.
 * Use with db.useQuery or db.queryOnce.
 */
export function refundedOrdersForShiftQuery(venueId: string, shiftId: string) {
  return {
    orderEvents: {
      $: {
        where: {
          venue: venueId,
          action: 'refunded',
        },
      },
      order: {},
    },
    payments: {
      $: {
        where: {
          venue: venueId,
          shift: shiftId,
          method: 'refund',
        },
      },
      order: {},
    },
  } as const;
}
