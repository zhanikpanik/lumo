import type { CommandDatabase } from './database.js';
import { DomainError, guardActiveOrder } from '../errors.js';
import { deterministicId } from '../ids.js';
import { serializeOrderLineSnapshot, type OrderLineSnapshot } from '../snapshots.js';

interface OperationContext {
  operationId: string;
  venueId: string;
  deviceId: string;
  actorEmployeeId: string;
  clientTimestamp: string;
}

export interface CreateOrderInput extends OperationContext {
  shiftId: string;
  tableId?: string;
  tableNumber?: string;
  zoneName?: string;
  guestCount: number;
  orderType: string;
  isQuickCheck: boolean;
  orderNumber: string;
}

export interface AddOrderLineInput extends OperationContext {
  orderId: string;
  productId: string;
  productName: string;
  productPriceTiyin: number;
  quantity: number;
  guestNumber: number;
  comment?: string;
  consumptionSnapshot: OrderLineSnapshot;
}

export interface RemoveOrderLineInput extends OperationContext {
  orderId: string;
  orderItemId: string;
  itemPriceTiyin: number;
  itemQuantity: number;
}

export interface TransferOrderInput extends OperationContext {
  orderId: string;
  fromEmployeeId: string;
  toEmployeeId: string;
}

export interface ManagerTakeoverInput extends OperationContext {
  orderId: string;
  newOwnerEmployeeId: string;
  reason: string;
}

export interface CancelOrderInput extends OperationContext {
  orderId: string;
  closeReason: string;
}

function orderEvent(
  db: CommandDatabase,
  input: OperationContext,
  orderId: string,
  action: string,
  metadata: Record<string, string | number>,
) {
  const id = deterministicId('order-event', input.operationId, action);
  return db.tx.orderEvents[id]
    .update({ venueId: input.venueId, operationId: input.operationId, action, occurredAt: input.clientTimestamp, metadata })
    .link({
      order: orderId,
      venue: input.venueId,
      actorEmployee: input.actorEmployeeId,
      device: input.deviceId,
    });
}

export function createOrder(
  db: CommandDatabase,
  input: CreateOrderInput,
) {
  return {
    async execute() {
      const id = deterministicId('order', input.operationId);
      await db.transact([
        db.tx.orders[id]
          .update({
            venueId: input.venueId,
            operationId: input.operationId,
            number: input.orderNumber,
            status: 'active',
            guestCount: input.guestCount,
            tableNumber: input.tableNumber,
            zoneName: input.zoneName,
            orderType: input.orderType,
            isQuickCheck: input.isQuickCheck,
            openedAt: input.clientTimestamp,
            totalAmountTiyin: 0,
            source: 'pos',
            createdAt: input.clientTimestamp,
            version: 0,
          })
          .link({
            venue: input.venueId,
            shift: input.shiftId,
            ...(input.tableId ? { table: input.tableId } : {}),
            ownerEmployee: input.actorEmployeeId,
            device: input.deviceId,
          }),
        orderEvent(db, input, id, 'created', { orderNumber: input.orderNumber }),
      ]);
      return { orderId: id };
    },
  };
}

export function addOrderLine(
  db: CommandDatabase,
  input: AddOrderLineInput,
  currentOrder?: { id: string; status: string; totalAmountTiyin: number },
) {
  return {
    async execute() {
      // currentOrder may be undefined when the order was just created and
      // the reactive query hasn't caught up yet. In that case, treat the
      // order as active with total 0 (correct for a freshly created order).
      const order = currentOrder ?? { id: input.orderId, status: 'active', totalAmountTiyin: 0 };
      const guard = guardActiveOrder(order.status, input.orderId);
      if (guard) throw guard;

      const itemId = deterministicId('order-item', input.operationId);
      const newTotal = order.totalAmountTiyin + input.productPriceTiyin * input.quantity;
      await db.transact([
        db.tx.orderItems[itemId]
          .update({
            venueId: input.venueId,
            operationId: input.operationId,
            productName: input.productName,
            productPriceTiyin: input.productPriceTiyin,
            quantity: input.quantity,
            guestNumber: input.guestNumber,
            comment: input.comment,
            consumptionSnapshotJson: serializeOrderLineSnapshot(input.consumptionSnapshot),
            createdAt: input.clientTimestamp,
          })
          .link({ order: input.orderId, product: input.productId }),
        db.tx.orders[input.orderId].update({ totalAmountTiyin: newTotal }),
        orderEvent(db, input, input.orderId, 'item_added', { orderItemId: itemId }),
      ]);

      return { orderItemId: itemId, newTotal };
    },
  };
}

export function removeOrderLine(
  db: CommandDatabase,
  input: RemoveOrderLineInput,
  currentOrder: { id: string; status: string; totalAmountTiyin: number } | undefined,
) {
  return {
    async execute() {
      if (!currentOrder) throw new DomainError(`Order ${input.orderId} was not found`, 'order_not_found');
      const guard = guardActiveOrder(currentOrder.status, input.orderId);
      if (guard) throw guard;

      const newTotal = Math.max(0, currentOrder.totalAmountTiyin - input.itemPriceTiyin * input.itemQuantity);
      await db.transact([
        db.tx.orderItems[input.orderItemId].delete(),
        db.tx.orders[input.orderId].update({ totalAmountTiyin: newTotal }),
        orderEvent(db, input, input.orderId, 'item_removed', { orderItemId: input.orderItemId }),
      ]);

      return { newTotal };
    },
  };
}

export function transferOrder(
  db: CommandDatabase,
  input: TransferOrderInput,
  currentOrder: { id: string; status: string } | undefined,
) {
  return {
    async execute() {
      if (!currentOrder) throw new DomainError(`Order ${input.orderId} was not found`, 'order_not_found');
      const guard = guardActiveOrder(currentOrder.status, input.orderId);
      if (guard) throw guard;

      await db.transact([
        db.tx.orders[input.orderId].update({}).link({ ownerEmployee: input.toEmployeeId }),
        orderEvent(db, input, input.orderId, 'transferred', {
          fromEmployeeId: input.fromEmployeeId,
          toEmployeeId: input.toEmployeeId,
        }),
      ]);

      return { newOwner: input.toEmployeeId };
    },
  };
}

export function managerTakeoverOrder(
  db: CommandDatabase,
  input: ManagerTakeoverInput,
  currentOrder: { id: string; status: string } | undefined,
) {
  return {
    async execute() {
      if (!currentOrder) throw new DomainError(`Order ${input.orderId} was not found`, 'order_not_found');
      const guard = guardActiveOrder(currentOrder.status, input.orderId);
      if (guard) throw guard;

      await db.transact([
        db.tx.orders[input.orderId].update({}).link({ ownerEmployee: input.newOwnerEmployeeId }),
        orderEvent(db, input, input.orderId, 'manager_takeover', {
          newOwnerEmployeeId: input.newOwnerEmployeeId,
          reason: input.reason,
        }),
      ]);

      return { newOwner: input.newOwnerEmployeeId };
    },
  };
}

export function cancelOrder(
  db: CommandDatabase,
  input: CancelOrderInput,
  currentOrder: { id: string; status: string } | undefined,
) {
  return {
    async execute() {
      if (!currentOrder) throw new DomainError(`Order ${input.orderId} was not found`, 'order_not_found');
      const guard = guardActiveOrder(currentOrder.status, input.orderId);
      if (guard) throw guard;

      await db.transact([
        db.tx.orders[input.orderId].update({
          status: 'cancelled',
          closedAt: input.clientTimestamp,
          closeReason: input.closeReason,
        }),
        orderEvent(db, input, input.orderId, 'cancelled', { closeReason: input.closeReason }),
      ]);

      return { orderId: input.orderId, status: 'cancelled' as const };
    },
  };
}
