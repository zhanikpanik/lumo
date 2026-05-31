import { supabase } from '../utils/supabase';

export type ShiftSummaryRpc = {
  ok?: boolean;
  error?: string;
  expected_cash?: number;
  starting_cash?: number;
  cash_sales?: number;
  cash_refunds?: number;
  cash_collections?: number;
  cash_float_in?: number;
  cash_float_out?: number;
  is_closed?: boolean;
};

export async function fetchShiftCashSummary(venueId: string, shiftId: string): Promise<{
  ok: boolean;
  error?: string;
  summary?: ShiftSummaryRpc;
}> {
  const { data, error } = await supabase.rpc('pos_shift_cash_summary', {
    p_venue_id: venueId,
    p_shift_id: shiftId,
  });

  if (error) return { ok: false, error: error.message };
  const raw = (data ?? null) as ShiftSummaryRpc | null;
  if (!raw || raw.ok === false) return { ok: false, error: raw?.error ?? 'shift_summary_failed' };
  return { ok: true, summary: raw };
}

export async function recordCashCollection(
  venueId: string,
  shiftId: string,
  amount: number,
  note?: string,
): Promise<{ ok: boolean; error?: string; summary?: ShiftSummaryRpc }> {
  const { data, error } = await supabase.rpc('pos_record_cash_collection', {
    p_venue_id: venueId,
    p_shift_id: shiftId,
    p_amount: amount,
    p_note: note ?? null,
    p_occurred_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  const raw = (data ?? null) as ShiftSummaryRpc | null;
  if (!raw || raw.ok === false) return { ok: false, error: raw?.error ?? 'cash_collection_failed' };
  return { ok: true, summary: raw };
}

export async function recordCashTransaction(
  venueId: string,
  shiftId: string,
  kind: 'in' | 'out',
  amount: number,
  note?: string,
  actorUserId?: string | null,
): Promise<{
  ok: boolean;
  error?: string;
  detail?: Record<string, unknown>;
  summary?: ShiftSummaryRpc;
}> {
  const { data, error } = await supabase.rpc('pos_record_cash_transaction', {
    p_venue_id: venueId,
    p_shift_id: shiftId,
    p_kind: kind,
    p_amount: amount,
    p_note: note ?? null,
    p_actor_user_id: actorUserId ?? null,
    p_occurred_at: new Date().toISOString(),
  });

  if (error) return { ok: false, error: error.message };

  const raw =
    (data ?? null) as
      | (ShiftSummaryRpc & { detail?: Record<string, unknown> })
      | null;

  if (!raw || raw.ok === false) {
    return {
      ok: false,
      error: raw?.error ?? 'cash_transaction_failed',
      detail: raw?.detail,
    };
  }
  return { ok: true, summary: raw };
}

export async function closeShiftOnServer(
  venueId: string,
  shiftId: string,
  countedCash: number,
): Promise<{ ok: boolean; error?: string; payload?: any }> {
  const { data, error } = await supabase.rpc('pos_close_shift', {
    p_venue_id: venueId,
    p_shift_id: shiftId,
    p_counted_cash: countedCash,
    p_closed_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  const raw = (data ?? null) as { ok?: boolean; error?: string } | null;
  if (!raw || raw.ok === false) return { ok: false, error: raw?.error ?? 'close_shift_failed' };
  return { ok: true, payload: raw };
}
