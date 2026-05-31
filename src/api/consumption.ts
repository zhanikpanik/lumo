import { supabase } from '../utils/supabase';
import type {
  ConsumptionDeadLetter,
  DeadLetterResult,
  RecordDeadLetterPayload,
} from '../types/inventory';

/**
 * Server-side dead-letter for consumption events that failed local outbox
 * retries. Stored in `pos_consumption_dead_letters` so other devices and
 * admin tooling can see and resolve them.
 */
export async function recordConsumptionDeadLetter(
  payload: RecordDeadLetterPayload,
): Promise<DeadLetterResult> {
  const { data, error } = await supabase.rpc('pos_consumption_record_dead_letter', {
    p_venue_id: payload.venueId,
    p_idempotency_key: payload.idempotencyKey,
    p_payload: payload.payload as unknown as Record<string, unknown>,
    p_retries: payload.retries,
    p_last_error: payload.lastError ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const raw = data as { ok?: boolean; error?: string; detail?: Record<string, unknown> } | null;
  if (raw && raw.ok === false) {
    return { ok: false, error: raw.error ?? 'record_dead_letter_failed', detail: raw.detail };
  }
  return { ok: true };
}

export async function listConsumptionDeadLetters(venueId: string): Promise<ConsumptionDeadLetter[]> {
  const { data, error } = await supabase
    .from('pos_consumption_dead_letters')
    .select('*')
    .eq('venue_id', venueId)
    .neq('status', 'resolved')
    .order('last_seen_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ConsumptionDeadLetter[];
}

export async function retryConsumptionDeadLetter(idempotencyKey: string): Promise<DeadLetterResult> {
  const { data, error } = await supabase.rpc('pos_consumption_retry_dead_letter', {
    p_idempotency_key: idempotencyKey,
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
    return { ok: false, error: raw.error ?? 'retry_dead_letter_failed', detail: raw.detail };
  }
  return { ok: true, duplicate: !!(raw && raw.duplicate) };
}

export async function ackConsumptionDeadLetter(
  idempotencyKey: string,
  actorUserId: string | null,
): Promise<DeadLetterResult> {
  const { data, error } = await supabase.rpc('pos_consumption_ack_dead_letter', {
    p_idempotency_key: idempotencyKey,
    p_actor_user_id: actorUserId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const raw = data as { ok?: boolean; duplicate?: boolean; error?: string } | null;
  if (raw && raw.ok === false) {
    return { ok: false, error: raw.error ?? 'ack_dead_letter_failed' };
  }
  return { ok: true, duplicate: !!(raw && raw.duplicate) };
}
