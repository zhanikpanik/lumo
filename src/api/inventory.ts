import { supabase } from '../utils/supabase';
import { POS_REFUND_RPC_ENABLED } from '../config';
import type {
  CancelRefundPayload,
  CancelRefundResult,
  FinalizeConsumptionResult,
  FinalizeOrderConsumptionPayload,
  RefundOrderPayload,
  RefundOrderResult,
} from '../types/inventory';

/**
 * Warehouse-centric POS stock finalize: `pos_finalize_order_stock` (idempotent by order_id).
 * Errors: order_not_found, order_not_paid, no_qualifying_payment, missing_workshop_id,
 * missing_default_warehouse_id, insufficient_stock (+ detail).
 */
export async function finalizeOrderConsumption(
  payload: FinalizeOrderConsumptionPayload
): Promise<FinalizeConsumptionResult> {
  const strict = payload.strictInsufficientStock !== false;

  const { data, error } = await supabase.rpc('pos_finalize_order_stock', {
    p_venue_id: payload.venueId,
    p_order_id: payload.orderId,
    p_occurred_at: payload.occurredAt,
    p_lines: payload.lines,
    p_shift_id: payload.shiftId ?? null,
    p_strict_insufficient: strict,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const raw = data as {
    ok?: boolean;
    duplicate?: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  } | null;

  if (raw && raw.ok === false) {
    return {
      ok: false,
      error: raw.error ?? 'pos_finalize_order_stock_failed',
      detail: raw.detail,
    };
  }
  return { ok: true, duplicate: !!(raw && raw.duplicate) };
}

export async function refundOrder(payload: RefundOrderPayload): Promise<RefundOrderResult> {
  if (!POS_REFUND_RPC_ENABLED) {
    return { ok: false, error: 'refund_rpc_disabled' };
  }

  const { data, error } = await supabase.rpc('pos_refund_order', {
    p_venue_id: payload.venueId,
    p_order_id: payload.orderId,
    p_shift_id: payload.shiftId ?? null,
    p_actor_user_id: payload.actorUserId ?? null,
    p_reason: payload.reason ?? null,
    p_occurred_at: payload.occurredAt ?? new Date().toISOString(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const raw = data as {
    ok?: boolean;
    duplicate?: boolean;
    error?: string;
    detail?: Record<string, unknown>;
    payment_method?: string;
    payment_amount?: number;
    reversed_movements?: number;
  } | null;

  if (raw && raw.ok === false) {
    return {
      ok: false,
      error: raw.error ?? 'pos_refund_order_failed',
      detail: raw.detail,
    };
  }

  return {
    ok: true,
    duplicate: !!(raw && raw.duplicate),
    payment_method: raw?.payment_method,
    payment_amount: raw?.payment_amount,
    reversed_movements: raw?.reversed_movements,
  };
}

export async function cancelRefund(payload: CancelRefundPayload): Promise<CancelRefundResult> {
  if (!POS_REFUND_RPC_ENABLED) {
    return { ok: false, error: 'refund_rpc_disabled' };
  }

  const { data, error } = await supabase.rpc('pos_cancel_refund', {
    p_venue_id: payload.venueId,
    p_order_id: payload.orderId,
    p_actor_user_id: payload.actorUserId ?? null,
    p_occurred_at: payload.occurredAt ?? new Date().toISOString(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const raw = data as {
    ok?: boolean;
    duplicate?: boolean;
    error?: string;
    detail?: Record<string, unknown>;
    payment_method?: string;
    payment_amount?: number;
    restored_movements?: number;
  } | null;

  if (raw && raw.ok === false) {
    return {
      ok: false,
      error: raw.error ?? 'pos_cancel_refund_failed',
      detail: raw.detail,
    };
  }

  return {
    ok: true,
    duplicate: !!(raw && raw.duplicate),
    payment_method: raw?.payment_method,
    payment_amount: raw?.payment_amount,
    restored_movements: raw?.restored_movements,
  };
}
