import { supabase } from './supabase';
import { logger } from './logger';

/**
 * Safe Supabase RPC wrapper — standardises error handling.
 * Returns { ok, data, error } so callers never deal with raw Supabase errors.
 */
export async function safeRpc<T = any>(
  fn: string,
  params?: Record<string, unknown>,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const { data, error } = await supabase.rpc(fn, params);
    if (error) {
      logger.error(`supabase.rpc.${fn}`, error.message, params);
      return { ok: false, error: error.message };
    }
    return { ok: true, data: data as T };
  } catch (e: any) {
    logger.error(`supabase.rpc.${fn}.exception`, e?.message ?? String(e), params);
    return { ok: false, error: e?.message ?? 'supabase_rpc_exception' };
  }
}

/**
 * Parse a Supabase row (snake_case) into a typed object.
 * Converts string numbers, ISO dates, and nulls safely.
 */
export function parseSupabaseRow<T extends Record<string, unknown>>(
  row: Record<string, any>,
  mapping: Record<keyof T, (val: any) => any>,
): T {
  const result: any = {};
  for (const [key, transform] of Object.entries(mapping)) {
    result[key] = transform(row[key]);
  }
  return result as T;
}
