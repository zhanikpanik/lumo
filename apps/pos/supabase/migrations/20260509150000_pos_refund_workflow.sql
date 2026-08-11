-- POS refund workflow (phase 1): DB-consistent reopen without terminal/fiscal integration.
-- Covers payment audit, shift totals compensation, stock reverse, and idempotency.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS refund_shift_id uuid REFERENCES shifts(id),
  ADD COLUMN IF NOT EXISTS refund_metadata jsonb;

CREATE INDEX IF NOT EXISTS idx_payments_order_refunded_at
  ON payments (order_id, refunded_at);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'inventory_movement_reason'
      AND n.nspname = 'public'
  ) THEN
    ALTER TYPE inventory_movement_reason ADD VALUE IF NOT EXISTS 'refund';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS pos_order_refunds (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id),
  refund_shift_id uuid REFERENCES shifts(id),
  actor_user_id uuid REFERENCES users(id),
  reason text,
  payment_method payment_method,
  payment_amount numeric(10,2),
  refunded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_order_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all reads" ON pos_order_refunds;
DROP POLICY IF EXISTS "Allow all inserts" ON pos_order_refunds;
DROP POLICY IF EXISTS "Allow all updates" ON pos_order_refunds;
DROP POLICY IF EXISTS "Allow all deletes" ON pos_order_refunds;
DROP POLICY IF EXISTS "pos_order_refunds service all" ON pos_order_refunds;
CREATE POLICY "pos_order_refunds service all"
ON pos_order_refunds
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE pos_order_refunds FROM PUBLIC;
REVOKE ALL ON TABLE pos_order_refunds FROM anon;
REVOKE ALL ON TABLE pos_order_refunds FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pos_order_refunds TO service_role;

CREATE OR REPLACE FUNCTION pos_refund_order(
  p_venue_id uuid,
  p_order_id uuid,
  p_shift_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_access_allowed boolean;
  v_actor_role user_role;
  v_order_status order_status;
  v_order_shift_id uuid;
  v_payment_id uuid;
  v_payment_method payment_method;
  v_payment_amount numeric(10,2);
  v_already_refunded_at timestamptz;
  v_refund_marker uuid;
  v_shift_exists boolean;
  v_rowcount int;
  v_reversed_movements int := 0;
  v_mv record;
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
    )
    INTO v_access_allowed;
  ELSE
    v_access_allowed := false;
  END IF;

  IF NOT COALESCE(v_access_allowed, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_actor_user_id IS NOT NULL THEN
    SELECT u.role
    INTO v_actor_role
    FROM users u
    JOIN user_venues uv
      ON uv.user_id = u.id
     AND uv.venue_id = p_venue_id
    WHERE u.id = p_actor_user_id
    LIMIT 1;

    IF v_actor_role IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'actor_not_allowed');
    END IF;

    IF v_actor_role = 'waiter' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'actor_forbidden_role');
    END IF;
  END IF;

  SELECT o.status, o.shift_id
  INTO v_order_status, v_order_shift_id
  FROM orders o
  WHERE o.id = p_order_id
    AND o.venue_id = p_venue_id
  FOR UPDATE;

  IF v_order_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_order_status = 'active' THEN
    IF EXISTS (SELECT 1 FROM pos_order_refunds r WHERE r.order_id = p_order_id) THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid');
  END IF;

  IF v_order_status IS DISTINCT FROM 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid');
  END IF;

  IF p_shift_id IS NULL THEN
    p_shift_id := v_order_shift_id;
  END IF;

  IF p_shift_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shift_required');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM shifts s
    WHERE s.id = p_shift_id
      AND s.venue_id = p_venue_id
      AND s.closed_at IS NULL
  )
  INTO v_shift_exists;

  IF NOT v_shift_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shift_not_open');
  END IF;

  IF v_order_shift_id IS NOT NULL AND v_order_shift_id IS DISTINCT FROM p_shift_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'shift_mismatch',
      'detail', jsonb_build_object(
        'order_shift_id', v_order_shift_id,
        'refund_shift_id', p_shift_id
      )
    );
  END IF;

  SELECT p.id, p.method, p.amount, p.refunded_at
  INTO v_payment_id, v_payment_method, v_payment_amount, v_already_refunded_at
  FROM payments p
  WHERE p.order_id = p_order_id
    AND p.venue_id = p_venue_id
    AND p.method IN ('cash', 'card', 'qr', 'other')
  ORDER BY p.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_payment_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_qualifying_payment');
  END IF;

  IF v_already_refunded_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  INSERT INTO pos_order_refunds (
    order_id,
    venue_id,
    refund_shift_id,
    actor_user_id,
    reason,
    payment_method,
    payment_amount,
    refunded_at
  )
  VALUES (
    p_order_id,
    p_venue_id,
    p_shift_id,
    p_actor_user_id,
    NULLIF(TRIM(COALESCE(p_reason, '')), ''),
    v_payment_method,
    v_payment_amount,
    p_occurred_at
  )
  ON CONFLICT (order_id) DO NOTHING
  RETURNING order_id INTO v_refund_marker;

  IF v_refund_marker IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  UPDATE payments
  SET refunded_at = p_occurred_at,
      refunded_by = p_actor_user_id,
      refund_reason = NULLIF(TRIM(COALESCE(p_reason, '')), ''),
      refund_shift_id = p_shift_id,
      refund_metadata = COALESCE(refund_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'rpc', 'pos_refund_order',
          'refunded_via', 'pos_phase1'
        )
  WHERE id = v_payment_id
    AND refunded_at IS NULL;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  UPDATE shifts
  SET total_orders = GREATEST(COALESCE(total_orders, 0) - 1, 0),
      total_revenue = COALESCE(total_revenue, 0) - v_payment_amount,
      cash_total = COALESCE(cash_total, 0) - CASE WHEN v_payment_method = 'cash' THEN v_payment_amount ELSE 0 END,
      card_total = COALESCE(card_total, 0) - CASE WHEN v_payment_method = 'card' THEN v_payment_amount ELSE 0 END,
      other_total = COALESCE(other_total, 0) - CASE WHEN v_payment_method IN ('qr', 'other') THEN v_payment_amount ELSE 0 END
  WHERE id = p_shift_id
    AND venue_id = p_venue_id;

  FOR v_mv IN
    SELECT
      m.id,
      m.warehouse_id,
      m.product_id,
      m.quantity_delta,
      m.unit,
      m.line_idempotency_key,
      m.metadata
    FROM inventory_movements m
    WHERE m.venue_id = p_venue_id
      AND m.ref_type = 'order'
      AND m.ref_id = p_order_id
      AND m.reason = 'sale'
      AND m.line_idempotency_key NOT LIKE '%:refund'
  LOOP
    INSERT INTO inventory_movements (
      venue_id,
      warehouse_id,
      product_id,
      quantity_delta,
      unit,
      reason,
      ref_type,
      ref_id,
      line_idempotency_key,
      occurred_at,
      metadata
    )
    VALUES (
      p_venue_id,
      v_mv.warehouse_id,
      v_mv.product_id,
      -v_mv.quantity_delta,
      v_mv.unit,
      'refund',
      'order_refund',
      p_order_id,
      v_mv.line_idempotency_key || ':refund',
      p_occurred_at,
      COALESCE(v_mv.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'source_movement_id', v_mv.id,
          'source_line_key', v_mv.line_idempotency_key,
          'rpc', 'pos_refund_order'
        )
    )
    ON CONFLICT (line_idempotency_key) DO NOTHING;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount > 0 THEN
      PERFORM apply_stock_delta(
        v_mv.warehouse_id,
        v_mv.product_id,
        -v_mv.quantity_delta,
        v_mv.unit
      );
      v_reversed_movements := v_reversed_movements + 1;
    END IF;
  END LOOP;

  DELETE FROM pos_order_stock_settlements
  WHERE order_id = p_order_id;

  UPDATE orders
  SET status = 'active',
      closed_at = NULL
  WHERE id = p_order_id
    AND venue_id = p_venue_id;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'payment_method', v_payment_method,
    'payment_amount', v_payment_amount,
    'reversed_movements', v_reversed_movements
  );
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.pos_refund_order(uuid,uuid,uuid,uuid,text,timestamptz)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION pos_refund_order(uuid, uuid, uuid, uuid, text, timestamptz) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION pos_refund_order(uuid, uuid, uuid, uuid, text, timestamptz) FROM anon;
    REVOKE EXECUTE ON FUNCTION pos_refund_order(uuid, uuid, uuid, uuid, text, timestamptz) FROM authenticated;
    GRANT EXECUTE ON FUNCTION pos_refund_order(uuid, uuid, uuid, uuid, text, timestamptz) TO anon;
    GRANT EXECUTE ON FUNCTION pos_refund_order(uuid, uuid, uuid, uuid, text, timestamptz) TO authenticated;
    GRANT EXECUTE ON FUNCTION pos_refund_order(uuid, uuid, uuid, uuid, text, timestamptz) TO service_role;
  END IF;
END
$$;
