import { supabase } from '../utils/supabase';
import { VENUE_ID } from '../config';
import { logger } from '../utils/logger';

export async function fetchActiveRefunds(shiftId: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('pos_active_refunds_for_shift', {
    p_venue_id: VENUE_ID,
    p_shift_id: shiftId,
  });
  if (error) {
    logger.error('api.payments.fetchActiveRefunds', error.message);
    return new Set();
  }
  const rows = (data ?? []) as Array<{ order_id: string }>;
  return new Set(rows.map((r) => r.order_id));
}

export async function fetchPaymentForOrder(orderId: string): Promise<{ method: string; amount: number; change_amount: number; close_reason: string } | null> {
  const { data } = await supabase
    .from('payments')
    .select('method, amount, change_amount, close_reason')
    .eq('order_id', orderId)
    .maybeSingle();
  return (data ?? null) as any;
}

export async function insertPayment(params: {
  orderId: string;
  shiftId: string;
  method: string;
  amount: number;
  cashAmount?: number;
  closeReason?: string | null;
  idempotencyKey: string;
}): Promise<{ ok: boolean; error?: string; isIdempotencyConflict?: boolean }> {
  const { error } = await supabase.from('payments').insert({
    order_id: params.orderId,
    venue_id: VENUE_ID,
    shift_id: params.shiftId,
    method: params.method === 'none' ? 'none' : params.method,
    amount: params.amount,
    change_amount: params.method === 'cash' ? Math.max(0, (params.cashAmount ?? 0) - params.amount) : 0,
    close_reason: params.method === 'none' ? (params.closeReason ?? '') : null,
    idempotency_key: params.idempotencyKey,
  });

  if (error) {
    logger.error('api.payments.insertPayment', error.message, { orderId: params.orderId });
    // 23505 — unique violation (likely idempotency key conflict — payment already recorded)
    const isIdempotencyConflict = error.code === '23505';
    return { ok: false, error: error.message, isIdempotencyConflict };
  }
  return { ok: true };
}
