-- P0: refund cancel (undo refund)
-- - pos_order_refunds gains snapshot columns to allow safe cancel
-- - pos_refund_order is updated to populate them
-- - inventory_movement_reason gains 'refund_cancel'
-- - sync_cash_movements_from_payments handles refund -> NULL transitions
-- - pos_cancel_refund RPC reverses pos_refund_order while preserving audit trail

ALTER TABLE pos_order_refunds
  ADD COLUMN IF NOT EXISTS order_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_total_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS items_count int,
  ADD COLUMN IF NOT EXISTS items_signature text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancel_metadata jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'inventory_movement_reason'
      AND n.nspname = 'public'
  ) THEN
    ALTER TYPE inventory_movement_reason ADD VALUE IF NOT EXISTS 'refund_cancel';
  END IF;
END
$$;

-- Stable signature of order_items (id|product|qty|price) used to detect post-refund edits.
CREATE OR REPLACE FUNCTION pos_order_items_signature(p_order_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sig text;
BEGIN
  SELECT md5(string_agg(
    oi.id::text || ':' || oi.product_id::text || ':' || oi.quantity::text || ':' || oi.product_price::text,
    '|' ORDER BY oi.id
  ))
  INTO v_sig
  FROM order_items oi
  WHERE oi.order_id = p_order_id;
  RETURN COALESCE(v_sig, '');
END;
$$;

GRANT EXECUTE ON FUNCTION pos_order_items_signature(uuid) TO anon;
GRANT EXECUTE ON FUNCTION pos_order_items_signature(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_order_items_signature(uuid) TO service_role;

-- Replace pos_refund_order to capture order snapshot at refund time.
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
  v_order_closed_at timestamptz;
  v_order_total_amount numeric(10,2);
  v_items_count int;
  v_items_sig text;
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

  SELECT o.status, o.shift_id, o.closed_at, o.total_amount
  INTO v_order_status, v_order_shift_id, v_order_closed_at, v_order_total_amount
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

  SELECT COUNT(*) INTO v_items_count FROM order_items oi WHERE oi.order_id = p_order_id;
  v_items_sig := pos_order_items_signature(p_order_id);

  INSERT INTO pos_order_refunds (
    order_id,
    venue_id,
    refund_shift_id,
    actor_user_id,
    reason,
    payment_method,
    payment_amount,
    refunded_at,
    order_closed_at,
    order_total_amount,
    items_count,
    items_signature
  )
  VALUES (
    p_order_id,
    p_venue_id,
    p_shift_id,
    p_actor_user_id,
    NULLIF(TRIM(COALESCE(p_reason, '')), ''),
    v_payment_method,
    v_payment_amount,
    p_occurred_at,
    v_order_closed_at,
    v_order_total_amount,
    v_items_count,
    v_items_sig
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
      AND m.line_idempotency_key NOT LIKE '%:refund:cancel'
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

  -- Log refund event
  INSERT INTO order_events (order_id, action, occurred_at, venue_id)
  VALUES (p_order_id, 'refunded', p_occurred_at, p_venue_id)
  ON CONFLICT DO NOTHING;

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
    GRANT EXECUTE ON FUNCTION pos_refund_order(uuid, uuid, uuid, uuid, text, timestamptz) TO anon;
    GRANT EXECUTE ON FUNCTION pos_refund_order(uuid, uuid, uuid, uuid, text, timestamptz) TO authenticated;
    GRANT EXECUTE ON FUNCTION pos_refund_order(uuid, uuid, uuid, uuid, text, timestamptz) TO service_role;
  END IF;
END
$$;

-- Trigger: now also remove cash refund row when refunded_at goes back to NULL.
CREATE OR REPLACE FUNCTION sync_cash_movements_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.method = 'cash' AND NEW.shift_id IS NOT NULL AND NEW.refunded_at IS NULL THEN
      INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, payment_id, order_id, occurred_at, note)
      VALUES (
        NEW.venue_id,
        NEW.shift_id,
        'sale',
        NEW.amount,
        NEW.id,
        NEW.order_id,
        COALESCE(NEW.created_at, now()),
        'payment_insert'
      )
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.method = 'cash'
      AND NEW.shift_id IS NOT NULL
      AND OLD.refunded_at IS NULL
      AND NEW.refunded_at IS NOT NULL
    THEN
      INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, payment_id, order_id, occurred_at, note)
      VALUES (
        NEW.venue_id,
        NEW.shift_id,
        'refund',
        NEW.amount,
        NEW.id,
        NEW.order_id,
        NEW.refunded_at,
        'payment_refund'
      )
      ON CONFLICT DO NOTHING;
    END IF;

    IF NEW.method = 'cash'
      AND OLD.refunded_at IS NOT NULL
      AND NEW.refunded_at IS NULL
    THEN
      DELETE FROM cash_movements
      WHERE payment_id = NEW.id
        AND movement_type = 'refund';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION pos_cancel_refund(
  p_venue_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
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
  v_refund record;
  v_order_status order_status;
  v_current_total numeric(10,2);
  v_current_items_count int;
  v_current_sig text;
  v_shift_open boolean;
  v_payment_id uuid;
  v_payment_method payment_method;
  v_payment_amount numeric(10,2);
  v_mv record;
  v_rowcount int;
  v_restored_movements int := 0;
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

  SELECT
    r.order_id, r.venue_id, r.refund_shift_id, r.payment_method,
    r.payment_amount, r.refunded_at,
    r.order_closed_at, r.order_total_amount, r.items_count, r.items_signature,
    r.cancelled_at
  INTO v_refund
  FROM pos_order_refunds r
  WHERE r.order_id = p_order_id
    AND r.venue_id = p_venue_id
  FOR UPDATE;

  IF v_refund.order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'refund_not_found');
  END IF;

  IF v_refund.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  SELECT o.status, o.total_amount
  INTO v_order_status, v_current_total
  FROM orders o
  WHERE o.id = p_order_id
    AND o.venue_id = p_venue_id
  FOR UPDATE;

  IF v_order_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_order_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_active');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM shifts s
    WHERE s.id = v_refund.refund_shift_id
      AND s.venue_id = p_venue_id
      AND s.closed_at IS NULL
  )
  INTO v_shift_open;

  IF NOT v_shift_open THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shift_not_open');
  END IF;

  -- Integrity: order_items must match snapshot when available; otherwise
  -- compare totals to payment_amount (legacy refunds without snapshot).
  v_current_sig := pos_order_items_signature(p_order_id);
  SELECT COUNT(*) INTO v_current_items_count FROM order_items oi WHERE oi.order_id = p_order_id;

  IF v_refund.items_signature IS NOT NULL THEN
    IF v_refund.items_signature IS DISTINCT FROM v_current_sig THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'order_items_changed_after_refund',
        'detail', jsonb_build_object(
          'expected_signature', v_refund.items_signature,
          'current_signature', v_current_sig,
          'expected_items_count', v_refund.items_count,
          'current_items_count', v_current_items_count
        )
      );
    END IF;
  ELSE
    IF COALESCE(v_current_total, 0) IS DISTINCT FROM COALESCE(v_refund.payment_amount, 0) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'order_total_changed_after_refund',
        'detail', jsonb_build_object(
          'expected_total', v_refund.payment_amount,
          'current_total', v_current_total
        )
      );
    END IF;
  END IF;

  SELECT p.id, p.method, p.amount
  INTO v_payment_id, v_payment_method, v_payment_amount
  FROM payments p
  WHERE p.order_id = p_order_id
    AND p.venue_id = p_venue_id
    AND p.method IN ('cash', 'card', 'qr', 'other')
    AND p.refunded_at IS NOT NULL
  ORDER BY p.refunded_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF v_payment_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_refunded_payment');
  END IF;

  -- Compensating sale movements for every refund movement, preserving audit.
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
      AND m.ref_type = 'order_refund'
      AND m.ref_id = p_order_id
      AND m.reason = 'refund'
      AND m.line_idempotency_key LIKE '%:refund'
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
      'refund_cancel',
      'order_refund_cancel',
      p_order_id,
      v_mv.line_idempotency_key || ':cancel',
      p_occurred_at,
      COALESCE(v_mv.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'source_refund_movement_id', v_mv.id,
          'rpc', 'pos_cancel_refund'
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
      v_restored_movements := v_restored_movements + 1;
    END IF;
  END LOOP;

  -- Restore shift totals.
  UPDATE shifts
  SET total_orders = COALESCE(total_orders, 0) + 1,
      total_revenue = COALESCE(total_revenue, 0) + v_payment_amount,
      cash_total = COALESCE(cash_total, 0) + CASE WHEN v_payment_method = 'cash' THEN v_payment_amount ELSE 0 END,
      card_total = COALESCE(card_total, 0) + CASE WHEN v_payment_method = 'card' THEN v_payment_amount ELSE 0 END,
      other_total = COALESCE(other_total, 0) + CASE WHEN v_payment_method IN ('qr', 'other') THEN v_payment_amount ELSE 0 END
  WHERE id = v_refund.refund_shift_id
    AND venue_id = p_venue_id;

  -- Reset payment refund fields (triggers cash_movements cleanup for cash refunds).
  UPDATE payments
  SET refunded_at = NULL,
      refunded_by = NULL,
      refund_reason = NULL,
      refund_shift_id = NULL,
      refund_metadata = COALESCE(refund_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'cancelled_via', 'pos_cancel_refund',
          'cancelled_at', p_occurred_at,
          'cancelled_by', p_actor_user_id
        )
  WHERE id = v_payment_id;

  -- Mark refund record as cancelled (kept for audit, NOT deleted).
  UPDATE pos_order_refunds
  SET cancelled_at = p_occurred_at,
      cancelled_by = p_actor_user_id,
      cancel_metadata = COALESCE(cancel_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'restored_movements', v_restored_movements,
          'rpc', 'pos_cancel_refund'
        )
  WHERE order_id = p_order_id
    AND venue_id = p_venue_id;

  -- Restore settlement marker so pos_finalize_order_stock won't run again on this order.
  INSERT INTO pos_order_stock_settlements (order_id, venue_id, settled_at)
  VALUES (p_order_id, p_venue_id, p_occurred_at)
  ON CONFLICT (order_id) DO UPDATE
    SET settled_at = EXCLUDED.settled_at;

  -- Restore order status back to paid.
  UPDATE orders
  SET status = 'paid',
      closed_at = COALESCE(v_refund.order_closed_at, p_occurred_at)
  WHERE id = p_order_id
    AND venue_id = p_venue_id;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'payment_method', v_payment_method,
    'payment_amount', v_payment_amount,
    'restored_movements', v_restored_movements
  );
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.pos_cancel_refund(uuid,uuid,uuid,timestamptz)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION pos_cancel_refund(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION pos_cancel_refund(uuid, uuid, uuid, timestamptz) TO anon;
    GRANT EXECUTE ON FUNCTION pos_cancel_refund(uuid, uuid, uuid, timestamptz) TO authenticated;
    GRANT EXECUTE ON FUNCTION pos_cancel_refund(uuid, uuid, uuid, timestamptz) TO service_role;
  END IF;
END
$$;
