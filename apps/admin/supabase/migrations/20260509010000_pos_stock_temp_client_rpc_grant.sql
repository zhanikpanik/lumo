-- TEMP DEV UNBLOCK:
-- Re-open direct client RPC execution for POS app until server-side proxy is implemented.
-- Remove this migration (or add a follow-up revoke migration) before production rollout.

DO $$
BEGIN
  IF to_regprocedure('public.pos_finalize_order_stock(uuid,uuid,timestamptz,jsonb,uuid,boolean)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION pos_finalize_order_stock(uuid, uuid, timestamptz, jsonb, uuid, boolean) TO anon;
    GRANT EXECUTE ON FUNCTION pos_finalize_order_stock(uuid, uuid, timestamptz, jsonb, uuid, boolean) TO authenticated;
  END IF;
END
$$;
