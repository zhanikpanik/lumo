import { useCallback } from 'react';
import { addPosOrderLine, cancelPosOrder, removePosOrderLine, updatePosOrder } from '../data/posCommands';
import type { OrderItem } from '../types';

interface UseInstantOrderEditorOptions {
  orderId: string | null | undefined;
  actorEmployeeId: string;
  /** Current order snapshot from InstantDB live query. Required for guards and total calculation. */
  currentOrder?: { id: string; status: string; totalAmountTiyin: number } | null;
  /** Retained until remove/cancel are migrated; not used by addItem. */
  products: Record<string, unknown>;
}

/**
 * Imperative bridge between POS user actions and authoritative commands.
 * The InstantDB live query remains the display source of truth; the worker
 * derives prices and consumption snapshots for newly added lines.
 */
export function useInstantOrderEditor({ orderId, actorEmployeeId, currentOrder }: UseInstantOrderEditorOptions) {

  const addItem = useCallback(async (item: OrderItem) => {
    if (!orderId) return;
    const operationId = `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const result = await addPosOrderLine({
        operationId,
        orderId,
        actorEmployeeId,
        productId: item.product.id,
        quantity: item.quantity,
        modifierIds: item.modifiers.map((modifier) => modifier.sourceModifierId ?? modifier.id),
        guestNumber: 1,
        comment: item.comment,
      });
      return result;
    } catch (e) {
      console.error('addOrderLine failed:', e);
      throw e;
    }
  }, [orderId, actorEmployeeId]);

  const removeItem = useCallback(async (itemId: string, _priceTiyin: number, _quantity: number) => {
    if (!orderId) return;
    const operationId = `rm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const result = await removePosOrderLine({
        operationId,
        orderId,
        orderItemId: itemId,
        actorEmployeeId,
      });
      console.log('removeOrderLine result:', result);
    } catch (e) {
      console.error('removeOrderLine failed:', e);
      throw e;
    }
  }, [orderId, actorEmployeeId]);

  const deleteCurrentOrder = useCallback(async (targetOrderId = orderId) => {
    if (!targetOrderId) return;
    const operationId = `cancel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const result = await cancelPosOrder({
        operationId,
        orderId: targetOrderId,
        actorEmployeeId,
        closeReason: 'deleted',
      });
      console.log('cancelOrder result:', result);
    } catch (e) {
      console.error('cancelOrder failed:', e);
      throw e;
    }
  }, [orderId, actorEmployeeId]);

  const updateMeta = useCallback(async (updates: Record<string, unknown>) => {
    if (!orderId) return;
    if (!currentOrder || currentOrder.status !== 'active') {
      console.error('updateMeta: order is not active');
      return;
    }
    const ownerEmployeeId = typeof updates.employeeId === 'string' ? updates.employeeId : undefined;
    const guestCount = typeof updates.guestCount === 'number' ? updates.guestCount : undefined;
    const comment = typeof updates.comment === 'string' ? updates.comment : undefined;
    try {
      await updatePosOrder({
        operationId: `update-order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        orderId,
        actorEmployeeId,
        updates: { guestCount, comment, ownerEmployeeId },
      });
    } catch (e) {
      console.error('updateOrderMeta failed:', e);
      throw e;
    }
  }, [orderId, actorEmployeeId, currentOrder]);
  return { addItem, removeItem, deleteCurrentOrder, updateMeta };
}
