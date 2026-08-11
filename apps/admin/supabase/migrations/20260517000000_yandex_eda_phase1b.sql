-- Yandex Eda Phase 1B + Marketplace cancellation helpers.
--
-- Two new RPCs to support marketplace order intake:
--
-- 1) pos_finalize_marketplace_active_stock — same stock-deduction logic as
--    pos_finalize_order_stock, but accepts orders with status='active' if they
--    came from a marketplace (order_source IN ('glovo','yandex_eda')) and does
--    not require a payments row. We need this for CASH orders that come from
--    Yandex Eda: the kitchen must start cooking immediately, but the cashier
--    will only collect the cash from the courier later.
--
-- 2) pos_cancel_unpaid_marketplace_order — reverses inventory_movements written
--    by RPC #1, deletes the pos_order_stock_settlements row, and marks the
--    order as cancelled. Used when Yandex sends DELETE /order before the
--    cashier has taken payment.
--
-- Both functions are SECURITY DEFINER and only callable by service_role
-- (the yandex-eda edge function uses the service role key).

CREATE OR REPLACE FUNCTION pos_finalize_marketplace_active_stock(
  p_venue_id     uuid,
  p_order_id     uuid,
  p_occurred_at  timestamptz,
  p_lines        jsonb,
  p_shift_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status order_status;
  v_source text;
  v_settled uuid;
  line jsonb;
  v_order_item_id uuid;
  v_dish_id uuid;
  v_line_qty int;
  v_expected_dish_id uuid;
  v_pt product_type;
  v_workshop_id uuid;
  v_wh_id uuid;
  v_rec record;
  v_mod record;
  v_delta numeric;
  v_line_key text;
  v_idempotency_key text;
  v_agg jsonb := '{}'::jsonb;
  v_key text;
  v_sub numeric;
  v_have numeric;
  r_kv record;
  v_parts text[];
  v_wh_u uuid;
  v_prod_u uuid;
  v_unit text;
  v_invalid_modifier_count int;
BEGIN
  -- service_role-only by GRANT below; no auth.role() check needed here.

  IF p_lines IS NULL OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lines_payload');
  END IF;

  v_idempotency_key := p_order_id::text || ':sale_consumption';

  INSERT INTO pos_order_stock_settlements (order_id, venue_id)
  VALUES (p_order_id, p_venue_id)
  ON CONFLICT (order_id) DO NOTHING
  RETURNING order_id INTO v_settled;

  IF v_settled IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  SELECT status, order_source INTO v_status, v_source
  FROM orders
  WHERE id = p_order_id
    AND venue_id = p_venue_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_source NOT IN ('glovo', 'yandex_eda') THEN
    DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_a_marketplace_order',
      'detail', jsonb_build_object('order_source', v_source)
    );
  END IF;

  IF v_status NOT IN ('active', 'paid') THEN
    DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'order_status_unsupported',
      'detail', jsonb_build_object('status', v_status)
    );
  END IF;

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    BEGIN
      v_order_item_id := NULLIF(line->>'order_item_id', '')::uuid;
      v_dish_id := NULLIF(line->>'product_id', '')::uuid;
      v_line_qty := COALESCE((line->>'quantity')::int, 1);
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_line_payload');
    END;

    IF v_order_item_id IS NULL OR v_dish_id IS NULL THEN
      DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_line_payload');
    END IF;

    IF v_line_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT oi.product_id
    INTO v_expected_dish_id
    FROM order_items oi
    WHERE oi.id = v_order_item_id
      AND oi.order_id = p_order_id;

    IF v_expected_dish_id IS NULL THEN
      DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'order_item_mismatch',
        'detail', jsonb_build_object('order_item_id', v_order_item_id)
      );
    END IF;

    IF v_expected_dish_id IS DISTINCT FROM v_dish_id THEN
      DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'line_product_mismatch',
        'detail', jsonb_build_object(
          'order_item_id', v_order_item_id,
          'expected_product_id', v_expected_dish_id,
          'provided_product_id', v_dish_id
        )
      );
    END IF;

    SELECT p.type, p.workshop_id
    INTO v_pt, v_workshop_id
    FROM products p
    WHERE p.id = v_dish_id
      AND p.venue_id = p_venue_id;

    IF v_pt IS NULL THEN
      DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'product_not_in_venue',
        'detail', jsonb_build_object('product_id', v_dish_id, 'venue_id', p_venue_id)
      );
    END IF;

    IF v_pt IS DISTINCT FROM 'dish'::product_type THEN
      CONTINUE;
    END IF;

    IF v_workshop_id IS NULL THEN
      DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'missing_workshop_id',
        'detail', jsonb_build_object('product_id', v_dish_id, 'order_item_id', v_order_item_id)
      );
    END IF;

    SELECT w.default_warehouse_id INTO v_wh_id
    FROM workshops w
    WHERE w.id = v_workshop_id
      AND w.venue_id = p_venue_id;

    IF v_wh_id IS NULL THEN
      DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'missing_default_warehouse_id',
        'detail', jsonb_build_object('workshop_id', v_workshop_id, 'product_id', v_dish_id)
      );
    END IF;

    SELECT COUNT(*)
    INTO v_invalid_modifier_count
    FROM order_item_modifiers oim
    LEFT JOIN modifiers m ON m.id = oim.modifier_id
    LEFT JOIN modifier_groups mg ON mg.id = m.modifier_group_id AND mg.venue_id = p_venue_id
    LEFT JOIN product_modifier_groups pmg ON pmg.modifier_group_id = mg.id AND pmg.product_id = v_dish_id
    WHERE oim.order_item_id = v_order_item_id
      AND oim.modifier_id IS NOT NULL
      AND (m.id IS NULL OR mg.id IS NULL OR pmg.id IS NULL);

    IF COALESCE(v_invalid_modifier_count, 0) > 0 THEN
      DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'invalid_order_item_modifiers',
        'detail', jsonb_build_object(
          'order_item_id', v_order_item_id,
          'product_id', v_dish_id,
          'invalid_count', v_invalid_modifier_count
        )
      );
    END IF;

    FOR v_rec IN
      SELECT ri.ingredient_id, ri.quantity AS base_q, ri.unit
      FROM recipe_items ri
      WHERE ri.product_id = v_dish_id
    LOOP
      v_delta := -(v_rec.base_q * v_line_qty);
      v_unit := COALESCE(NULLIF(TRIM(v_rec.unit), ''), 'г');
      v_key := v_wh_id::text || '|' || v_rec.ingredient_id::text || '|' || v_unit;
      v_sub := COALESCE((v_agg ->> v_key)::numeric, 0) + v_delta;
      v_agg := v_agg || jsonb_build_object(v_key, to_jsonb(v_sub));
    END LOOP;

    FOR v_mod IN
      SELECT DISTINCT
        m.id AS mod_id,
        m.ingredient_id,
        m.quantity AS mq,
        m.unit AS mu
      FROM order_item_modifiers oim
      JOIN modifiers m ON m.id = oim.modifier_id
      JOIN modifier_groups mg ON mg.id = m.modifier_group_id AND mg.venue_id = p_venue_id
      JOIN product_modifier_groups pmg ON pmg.modifier_group_id = mg.id AND pmg.product_id = v_dish_id
      WHERE oim.order_item_id = v_order_item_id
        AND m.ingredient_id IS NOT NULL
    LOOP
      v_delta := -(COALESCE(v_mod.mq, 0) * v_line_qty);
      IF v_delta = 0 THEN
        CONTINUE;
      END IF;
      v_unit := COALESCE(NULLIF(TRIM(v_mod.mu), ''), 'г');
      v_key := v_wh_id::text || '|' || v_mod.ingredient_id::text || '|' || v_unit;
      v_sub := COALESCE((v_agg ->> v_key)::numeric, 0) + v_delta;
      v_agg := v_agg || jsonb_build_object(v_key, to_jsonb(v_sub));
    END LOOP;
  END LOOP;

  -- Apply deltas (non-strict: marketplace orders are accepted even if stock
  -- would go negative — kitchen will know and operator will reconcile).
  FOR r_kv IN SELECT * FROM jsonb_each(v_agg)
  LOOP
    v_delta := (r_kv.value #>> '{}')::numeric;
    IF v_delta = 0 THEN CONTINUE; END IF;

    v_parts := string_to_array(r_kv.key, '|');
    v_wh_u := v_parts[1]::uuid;
    v_prod_u := v_parts[2]::uuid;
    v_unit := v_parts[3];

    INSERT INTO stock_items (id, warehouse_id, product_id, quantity, unit, updated_at)
    VALUES (gen_random_uuid(), v_wh_u, v_prod_u, 0, v_unit, now())
    ON CONFLICT (warehouse_id, product_id) DO NOTHING;

    UPDATE stock_items
    SET quantity = stock_items.quantity + v_delta,
        unit = v_unit,
        updated_at = now()
    WHERE warehouse_id = v_wh_u
      AND product_id = v_prod_u;
  END LOOP;

  -- Persist per-line audit movements (idempotent via line_idempotency_key).
  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_order_item_id := NULLIF(line->>'order_item_id', '')::uuid;
    v_dish_id := NULLIF(line->>'product_id', '')::uuid;
    v_line_qty := COALESCE((line->>'quantity')::int, 1);
    IF v_line_qty <= 0 THEN CONTINUE; END IF;

    SELECT p.type, p.workshop_id INTO v_pt, v_workshop_id
    FROM products p WHERE p.id = v_dish_id AND p.venue_id = p_venue_id;

    IF v_pt IS DISTINCT FROM 'dish'::product_type THEN CONTINUE; END IF;

    SELECT w.default_warehouse_id INTO v_wh_id
    FROM workshops w WHERE w.id = v_workshop_id AND w.venue_id = p_venue_id;

    IF v_wh_id IS NULL THEN CONTINUE; END IF;

    FOR v_rec IN
      SELECT ri.ingredient_id, ri.quantity AS base_q, ri.unit
      FROM recipe_items ri WHERE ri.product_id = v_dish_id
    LOOP
      v_delta := -(v_rec.base_q * v_line_qty);
      v_line_key := v_idempotency_key || ':' || v_order_item_id::text || ':r:' || v_rec.ingredient_id::text;

      INSERT INTO inventory_movements (
        venue_id, warehouse_id, product_id, quantity_delta, unit, reason,
        ref_type, ref_id, line_idempotency_key, occurred_at, metadata
      ) VALUES (
        p_venue_id, v_wh_id, v_rec.ingredient_id, v_delta,
        COALESCE(NULLIF(TRIM(v_rec.unit), ''), 'г'), 'sale',
        'order', p_order_id, v_line_key, p_occurred_at,
        jsonb_build_object(
          'order_item_id', v_order_item_id,
          'dish_id', v_dish_id,
          'shift_id', p_shift_id,
          'source', 'recipe',
          'rpc', 'pos_finalize_marketplace_active_stock'
        )
      ) ON CONFLICT (line_idempotency_key) DO NOTHING;
    END LOOP;

    FOR v_mod IN
      SELECT DISTINCT
        m.id AS mod_id, m.ingredient_id, m.quantity AS mq, m.unit AS mu
      FROM order_item_modifiers oim
      JOIN modifiers m ON m.id = oim.modifier_id
      JOIN modifier_groups mg ON mg.id = m.modifier_group_id AND mg.venue_id = p_venue_id
      JOIN product_modifier_groups pmg ON pmg.modifier_group_id = mg.id AND pmg.product_id = v_dish_id
      WHERE oim.order_item_id = v_order_item_id
        AND m.ingredient_id IS NOT NULL
    LOOP
      v_delta := -(COALESCE(v_mod.mq, 0) * v_line_qty);
      IF v_delta = 0 THEN CONTINUE; END IF;
      v_line_key := v_idempotency_key || ':' || v_order_item_id::text || ':m:' || v_mod.mod_id::text;

      INSERT INTO inventory_movements (
        venue_id, warehouse_id, product_id, quantity_delta, unit, reason,
        ref_type, ref_id, line_idempotency_key, occurred_at, metadata
      ) VALUES (
        p_venue_id, v_wh_id, v_mod.ingredient_id, v_delta,
        COALESCE(NULLIF(TRIM(v_mod.mu), ''), 'г'), 'sale',
        'order', p_order_id, v_line_key, p_occurred_at,
        jsonb_build_object(
          'order_item_id', v_order_item_id,
          'dish_id', v_dish_id,
          'modifier_id', v_mod.mod_id,
          'shift_id', p_shift_id,
          'source', 'modifier',
          'rpc', 'pos_finalize_marketplace_active_stock'
        )
      ) ON CONFLICT (line_idempotency_key) DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'duplicate', false);
END;
$$;

REVOKE ALL ON FUNCTION pos_finalize_marketplace_active_stock(uuid, uuid, timestamptz, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos_finalize_marketplace_active_stock(uuid, uuid, timestamptz, jsonb, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- pos_cancel_unpaid_marketplace_order — reverses an active marketplace order.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pos_cancel_unpaid_marketplace_order(
  p_venue_id uuid,
  p_order_id uuid,
  p_reason   text DEFAULT 'marketplace_cancel'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status order_status;
  v_source text;
  v_existing_meta jsonb;
  v_mv record;
  v_rowcount int;
  v_reversed int := 0;
BEGIN
  -- service_role-only by GRANT below.

  SELECT status, order_source, COALESCE(integration_metadata, '{}'::jsonb)
  INTO v_status, v_source, v_existing_meta
  FROM orders
  WHERE id = p_order_id AND venue_id = p_venue_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_source NOT IN ('glovo', 'yandex_eda') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_marketplace_order');
  END IF;

  IF v_status = 'cancelled' THEN
    -- Idempotent: nothing to undo.
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  IF v_status <> 'active' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'order_status_unsupported',
      'detail', jsonb_build_object('status', v_status)
    );
  END IF;

  -- Reverse the sale-time inventory movements written by pos_finalize_marketplace_active_stock.
  FOR v_mv IN
    SELECT m.id, m.warehouse_id, m.product_id, m.quantity_delta,
           m.unit, m.line_idempotency_key, m.metadata
    FROM inventory_movements m
    WHERE m.venue_id = p_venue_id
      AND m.ref_type = 'order'
      AND m.ref_id = p_order_id
      AND m.reason = 'sale'
      AND m.line_idempotency_key NOT LIKE '%:cancel'
  LOOP
    INSERT INTO inventory_movements (
      venue_id, warehouse_id, product_id, quantity_delta, unit, reason,
      ref_type, ref_id, line_idempotency_key, occurred_at, metadata
    )
    VALUES (
      p_venue_id,
      v_mv.warehouse_id,
      v_mv.product_id,
      -v_mv.quantity_delta,
      v_mv.unit,
      'refund',
      'order_cancel',
      p_order_id,
      v_mv.line_idempotency_key || ':cancel',
      now(),
      COALESCE(v_mv.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'source_movement_id', v_mv.id,
          'source_line_key', v_mv.line_idempotency_key,
          'reason', COALESCE(p_reason, 'marketplace_cancel'),
          'rpc', 'pos_cancel_unpaid_marketplace_order'
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
      v_reversed := v_reversed + 1;
    END IF;
  END LOOP;

  DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;

  UPDATE orders
  SET status = 'cancelled',
      closed_at = now(),
      integration_metadata = v_existing_meta
        || jsonb_build_object(
          'cancellation_reason', COALESCE(p_reason, 'marketplace_cancel'),
          'cancelled_at', now()
        )
  WHERE id = p_order_id AND venue_id = p_venue_id;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'reversed_movements', v_reversed
  );
END;
$$;

REVOKE ALL ON FUNCTION pos_cancel_unpaid_marketplace_order(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos_cancel_unpaid_marketplace_order(uuid, uuid, text) TO service_role;
