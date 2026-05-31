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


