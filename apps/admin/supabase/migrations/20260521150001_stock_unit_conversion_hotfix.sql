-- Hotfix: re-apply pos_finalize_order_stock with the correct 'anon' access check
-- and keep EXECUTE grant for anon/authenticated (same pattern as 20260509010000).
-- This supersedes the function body from 20260521150000 which accidentally reverted
-- the anon access check from 20260509120000.

CREATE OR REPLACE FUNCTION pos_finalize_order_stock(
  p_venue_id             uuid,
  p_order_id             uuid,
  p_occurred_at          timestamptz,
  p_lines                jsonb,
  p_shift_id             uuid DEFAULT NULL,
  p_strict_insufficient  boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status          order_status;
  v_has_payment     boolean;
  v_settled         uuid;
  line              jsonb;
  v_order_item_id   uuid;
  v_dish_id         uuid;
  v_line_qty        int;
  v_expected_dish_id uuid;
  v_pt              product_type;
  v_workshop_id     uuid;
  v_wh_id           uuid;
  v_rec             record;
  v_mod             record;
  v_delta           numeric;
  v_line_key        text;
  v_idempotency_key text;
  v_agg             jsonb := '{}'::jsonb;
  v_key             text;
  v_sub             numeric;
  v_have            numeric;
  v_stock_have      numeric;
  v_stock_unit      text;
  r_kv              record;
  v_parts           text[];
  v_wh_u            uuid;
  v_prod_u          uuid;
  v_unit            text;
  v_access_allowed  boolean;
  v_role            text;
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
      'detail', jsonb_build_object('venue_id', p_venue_id, 'reason', 'missing_venue_access')
    );
  END IF;

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

  SELECT status INTO v_status
  FROM orders
  WHERE id = p_order_id
    AND venue_id = p_venue_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_status IS DISTINCT FROM 'paid' THEN
    DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM payments
    WHERE order_id = p_order_id
      AND venue_id = p_venue_id
      AND method IN ('cash', 'card', 'qr', 'other')
  ) INTO v_has_payment;

  IF NOT v_has_payment THEN
    DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
    RETURN jsonb_build_object('ok', false, 'error', 'no_qualifying_payment');
  END IF;

  -- ── Phase 1: aggregate all required ingredients in base units ──
  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    BEGIN
      v_order_item_id := NULLIF(line->>'order_item_id', '')::uuid;
      v_dish_id       := NULLIF(line->>'product_id', '')::uuid;
      v_line_qty      := COALESCE((line->>'quantity')::int, 1);
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

    -- Recipe ingredients → convert to base, aggregate by (wh | ingredient)
    FOR v_rec IN
      SELECT ri.ingredient_id, ri.quantity AS base_q, ri.unit
      FROM recipe_items ri
      WHERE ri.product_id = v_dish_id
    LOOP
      v_delta := -to_base_unit(
        v_rec.base_q * v_line_qty,
        COALESCE(NULLIF(TRIM(v_rec.unit), ''), 'г')
      );
      v_unit := base_unit_for(COALESCE(NULLIF(TRIM(v_rec.unit), ''), 'г'));
      v_key := v_wh_id::text || '|' || v_rec.ingredient_id::text || '|' || v_unit;
      v_sub := COALESCE((v_agg ->> v_key)::numeric, 0) + v_delta;
      v_agg := v_agg || jsonb_build_object(v_key, to_jsonb(v_sub));
    END LOOP;

    -- Modifiers with ingredients → same treatment
    FOR v_mod IN
      SELECT m.id AS mod_id, m.ingredient_id, m.quantity AS mq, m.unit AS mu
      FROM modifiers m
      WHERE m.ingredient_id IS NOT NULL
        AND m.id IN (
          SELECT (jsonb_array_elements_text(COALESCE(line->'modifier_ids', '[]'::jsonb)))::uuid
        )
    LOOP
      v_delta := -to_base_unit(
        COALESCE(v_mod.mq, 0) * v_line_qty,
        COALESCE(NULLIF(TRIM(v_mod.mu), ''), 'г')
      );
      IF v_delta = 0 THEN
        CONTINUE;
      END IF;
      v_unit := base_unit_for(COALESCE(NULLIF(TRIM(v_mod.mu), ''), 'г'));
      v_key := v_wh_id::text || '|' || v_mod.ingredient_id::text || '|' || v_unit;
      v_sub := COALESCE((v_agg ->> v_key)::numeric, 0) + v_delta;
      v_agg := v_agg || jsonb_build_object(v_key, to_jsonb(v_sub));
    END LOOP;
  END LOOP;

  -- ── Phase 2: strict check — compare aggregated base deltas vs stock ──
  IF p_strict_insufficient THEN
    FOR r_kv IN SELECT * FROM jsonb_each(v_agg)
    LOOP
      v_key   := r_kv.key;
      v_delta := (r_kv.value #>> '{}')::numeric;
      IF v_delta >= 0 THEN
        CONTINUE;
      END IF;

      v_parts  := string_to_array(v_key, '|');
      v_wh_u   := v_parts[1]::uuid;
      v_prod_u := v_parts[2]::uuid;
      v_unit   := v_parts[3]; -- base unit

      SELECT quantity, unit INTO v_stock_have, v_stock_unit
      FROM stock_items
      WHERE warehouse_id = v_wh_u
        AND product_id = v_prod_u
      FOR UPDATE;

      v_have := to_base_unit(COALESCE(v_stock_have, 0), COALESCE(v_stock_unit, v_unit));

      IF v_have + v_delta < 0 THEN
        DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'insufficient_stock',
          'detail', jsonb_build_object(
            'warehouse_id', v_wh_u,
            'product_id',   v_prod_u,
            'unit',         v_unit,
            'available',    v_have,
            'delta',        v_delta
          )
        );
      END IF;
    END LOOP;
  END IF;

  -- ── Phase 3: apply deltas (unit-aware apply_stock_delta) ──
  FOR r_kv IN SELECT * FROM jsonb_each(v_agg)
  LOOP
    v_delta := (r_kv.value #>> '{}')::numeric;
    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    v_parts  := string_to_array(r_kv.key, '|');
    v_wh_u   := v_parts[1]::uuid;
    v_prod_u := v_parts[2]::uuid;
    v_unit   := v_parts[3]; -- base unit (г / мл)

    PERFORM apply_stock_delta(v_wh_u, v_prod_u, v_delta, v_unit);
  END LOOP;

  -- ── Phase 4: record inventory_movements (in recipe's native unit) ──
  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_order_item_id := NULLIF(line->>'order_item_id', '')::uuid;
    v_dish_id       := NULLIF(line->>'product_id', '')::uuid;
    v_line_qty      := COALESCE((line->>'quantity')::int, 1);
    IF v_line_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT p.type, p.workshop_id INTO v_pt, v_workshop_id
    FROM products p
    WHERE p.id = v_dish_id
      AND p.venue_id = p_venue_id;

    IF v_pt IS DISTINCT FROM 'dish'::product_type THEN
      CONTINUE;
    END IF;

    SELECT w.default_warehouse_id INTO v_wh_id
    FROM workshops w
    WHERE w.id = v_workshop_id
      AND w.venue_id = p_venue_id;

    IF v_wh_id IS NULL THEN
      CONTINUE;
    END IF;

    FOR v_rec IN
      SELECT ri.ingredient_id, ri.quantity AS base_q, ri.unit
      FROM recipe_items ri
      WHERE ri.product_id = v_dish_id
    LOOP
      v_delta := -(v_rec.base_q * v_line_qty);
      v_line_key :=
        v_idempotency_key || ':' || v_order_item_id::text || ':r:' || v_rec.ingredient_id::text;

      INSERT INTO inventory_movements (
        venue_id, warehouse_id, product_id, quantity_delta, unit, reason,
        ref_type, ref_id, line_idempotency_key, occurred_at, metadata
      ) VALUES (
        p_venue_id,
        v_wh_id,
        v_rec.ingredient_id,
        v_delta,
        COALESCE(NULLIF(TRIM(v_rec.unit), ''), 'г'),
        'sale',
        'order',
        p_order_id,
        v_line_key,
        p_occurred_at,
        jsonb_build_object(
          'order_item_id', v_order_item_id,
          'dish_id', v_dish_id,
          'shift_id', p_shift_id,
          'source', 'recipe',
          'rpc', 'pos_finalize_order_stock'
        )
      );
    END LOOP;

    FOR v_mod IN
      SELECT m.id AS mod_id, m.ingredient_id, m.quantity AS mq, m.unit AS mu
      FROM modifiers m
      WHERE m.ingredient_id IS NOT NULL
        AND m.id IN (
          SELECT (jsonb_array_elements_text(COALESCE(line->'modifier_ids', '[]'::jsonb)))::uuid
        )
    LOOP
      v_delta := -(COALESCE(v_mod.mq, 0) * v_line_qty);
      IF v_delta = 0 THEN
        CONTINUE;
      END IF;
      v_line_key :=
        v_idempotency_key || ':' || v_order_item_id::text || ':m:' || v_mod.mod_id::text;

      INSERT INTO inventory_movements (
        venue_id, warehouse_id, product_id, quantity_delta, unit, reason,
        ref_type, ref_id, line_idempotency_key, occurred_at, metadata
      ) VALUES (
        p_venue_id,
        v_wh_id,
        v_mod.ingredient_id,
        v_delta,
        COALESCE(NULLIF(TRIM(v_mod.mu), ''), 'г'),
        'sale',
        'order',
        p_order_id,
        v_line_key,
        p_occurred_at,
        jsonb_build_object(
          'order_item_id', v_order_item_id,
          'dish_id', v_dish_id,
          'modifier_id', v_mod.mod_id,
          'shift_id', p_shift_id,
          'source', 'modifier',
          'rpc', 'pos_finalize_order_stock'
        )
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'duplicate', false);
END;
$$;

-- Keep EXECUTE grants for anon/authenticated (temp dev unblock pattern).
DO $$
BEGIN
  IF to_regprocedure('public.pos_finalize_order_stock(uuid,uuid,timestamptz,jsonb,uuid,boolean)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION pos_finalize_order_stock(uuid, uuid, timestamptz, jsonb, uuid, boolean) TO anon;
    GRANT EXECUTE ON FUNCTION pos_finalize_order_stock(uuid, uuid, timestamptz, jsonb, uuid, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION pos_finalize_order_stock(uuid, uuid, timestamptz, jsonb, uuid, boolean) TO service_role;
  END IF;
END
$$;
