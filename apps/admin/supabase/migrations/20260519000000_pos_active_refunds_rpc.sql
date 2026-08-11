-- Expose active refunds for a shift to the POS client without opening
-- pos_order_refunds to anon/authenticated.
--
-- The base table is locked to service_role only (see 20260509150000), so the
-- client cannot SELECT from it directly. This SECURITY DEFINER function returns
-- just the set of order_ids that currently have an *active* refund (i.e. not
-- yet cancelled) for the given shift, scoped by venue.
--
-- It's a thin read-only RPC; no side effects, no extra metadata leakage.

CREATE OR REPLACE FUNCTION pos_active_refunds_for_shift(
  p_venue_id uuid,
  p_shift_id uuid
)
RETURNS TABLE (order_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.order_id
  FROM pos_order_refunds r
  WHERE r.venue_id = p_venue_id
    AND r.refund_shift_id = p_shift_id
    AND r.cancelled_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION pos_active_refunds_for_shift(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pos_active_refunds_for_shift(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION pos_active_refunds_for_shift(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION pos_active_refunds_for_shift(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION pos_active_refunds_for_shift(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_active_refunds_for_shift(uuid, uuid) TO service_role;
