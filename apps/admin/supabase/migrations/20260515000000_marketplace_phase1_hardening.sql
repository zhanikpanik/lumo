-- Glovo inbound Phase 1 hardening:
-- 1) Race-safe order numbering for venues via marketplace_next_order_number RPC.
-- 2) Modifier bindings table so Glovo attributes can map to our modifiers
--    and participate in stock decrement.

CREATE TABLE IF NOT EXISTS venue_order_counters (
  venue_id uuid PRIMARY KEY REFERENCES venues(id) ON DELETE CASCADE,
  last_number int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE venue_order_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_order_counters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON venue_order_counters FROM anon, authenticated;

CREATE OR REPLACE FUNCTION marketplace_next_order_number(p_venue_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seed int;
  v_next int;
BEGIN
  IF p_venue_id IS NULL THEN
    RAISE EXCEPTION 'venue_id_required';
  END IF;

  -- Bootstrap counter from existing orders the first time the venue is seen.
  IF NOT EXISTS (SELECT 1 FROM venue_order_counters WHERE venue_id = p_venue_id) THEN
    SELECT COALESCE(
      MAX(NULLIF(regexp_replace(number, '\D', '', 'g'), '')::int),
      0
    )
    INTO v_seed
    FROM orders
    WHERE venue_id = p_venue_id;

    INSERT INTO venue_order_counters (venue_id, last_number)
    VALUES (p_venue_id, v_seed)
    ON CONFLICT (venue_id) DO NOTHING;
  END IF;

  -- The UPDATE acquires a row-level lock, so concurrent callers serialize.
  UPDATE venue_order_counters
  SET last_number = last_number + 1,
      updated_at = now()
  WHERE venue_id = p_venue_id
  RETURNING last_number INTO v_next;

  RETURN v_next::text;
END;
$$;

REVOKE ALL ON FUNCTION marketplace_next_order_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketplace_next_order_number(uuid) TO service_role;

CREATE TABLE IF NOT EXISTS marketplace_modifier_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('glovo')),
  external_modifier_id text NOT NULL,
  modifier_id uuid NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, provider, external_modifier_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_modifier_bindings_venue
  ON marketplace_modifier_bindings (venue_id, provider);

ALTER TABLE marketplace_modifier_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_modifier_bindings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON marketplace_modifier_bindings FROM anon, authenticated;

-- Extend pos_shift_cash_summary to surface Glovo cancellations the operator must
-- manually finish before closing the shift (cancellation_pending=true on a paid order).
CREATE OR REPLACE FUNCTION pos_shift_cash_summary(
  p_venue_id uuid,
  p_shift_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access_allowed boolean;
  v_role text;
  v_starting_cash numeric(10,2);
  v_closed_at timestamptz;
  v_sale numeric(10,2) := 0;
  v_refund numeric(10,2) := 0;
  v_collection numeric(10,2) := 0;
  v_float_in numeric(10,2) := 0;
  v_float_out numeric(10,2) := 0;
  v_expected numeric(10,2);
  v_external_pending int := 0;
BEGIN
  v_role := auth.role();
  IF v_role IN ('service_role', 'anon') THEN
    v_access_allowed := true;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM user_venues uv
      WHERE uv.user_id = auth.uid()
        AND uv.venue_id = p_venue_id
    ) INTO v_access_allowed;
  ELSE
    v_access_allowed := false;
  END IF;

  IF NOT COALESCE(v_access_allowed, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'forbidden',
      'detail', jsonb_build_object('venue_id', p_venue_id)
    );
  END IF;

  SELECT s.starting_cash, s.closed_at
  INTO v_starting_cash, v_closed_at
  FROM shifts s
  WHERE s.id = p_shift_id
    AND s.venue_id = p_venue_id;

  IF v_starting_cash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shift_not_found');
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN cm.movement_type = 'sale' THEN cm.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cm.movement_type = 'refund' THEN cm.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cm.movement_type = 'collection' THEN cm.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cm.movement_type = 'float_in' THEN cm.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cm.movement_type = 'float_out' THEN cm.amount ELSE 0 END), 0)
  INTO v_sale, v_refund, v_collection, v_float_in, v_float_out
  FROM cash_movements cm
  WHERE cm.venue_id = p_venue_id
    AND cm.shift_id = p_shift_id;

  v_expected :=
    COALESCE(v_starting_cash, 0)
    + v_sale
    + v_float_in
    - v_refund
    - v_collection
    - v_float_out;

  SELECT COUNT(*)
  INTO v_external_pending
  FROM orders o
  WHERE o.venue_id = p_venue_id
    AND o.shift_id = p_shift_id
    AND COALESCE((o.integration_metadata->>'cancellation_pending')::boolean, false) = true;

  RETURN jsonb_build_object(
    'ok', true,
    'shift_id', p_shift_id,
    'is_closed', v_closed_at IS NOT NULL,
    'starting_cash', COALESCE(v_starting_cash, 0),
    'cash_sales', COALESCE(v_sale, 0),
    'cash_refunds', COALESCE(v_refund, 0),
    'cash_collections', COALESCE(v_collection, 0),
    'cash_float_in', COALESCE(v_float_in, 0),
    'cash_float_out', COALESCE(v_float_out, 0),
    'expected_cash', COALESCE(v_expected, 0),
    'external_pending_count', COALESCE(v_external_pending, 0)
  );
END;
$$;
