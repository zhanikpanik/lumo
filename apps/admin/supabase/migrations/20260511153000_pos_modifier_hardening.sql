-- P0: modifier stock hardening
-- - Source of truth for modifiers is server-side order_item_modifiers
-- - Enforce product/venue linkage via product_modifier_groups + modifier_groups
-- - Keep idempotency keys and movement metadata format unchanged

CREATE OR REPLACE FUNCTION pos_finalize_order_stock(
  p_venue_id uuid,
  p_order_id uuid,
  p_occurred_at timestamptz,
  p_lines jsonb,
  p_shift_id uuid DEFAULT NULL,
  p_strict_insufficient boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status order_status;
  v_has_payment boolean;
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
  v_access_allowed boolean;
  v_role text;
  v_invalid_modifier_count int;
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

    -- Fail fast if order item contains modifiers that are not linked to this dish/venue.
    SELECT COUNT(*)
    INTO v_invalid_modifier_count
    FROM order_item_modifiers oim
    LEFT JOIN modifiers m
      ON m.id = oim.modifier_id
    LEFT JOIN modifier_groups mg
      ON mg.id = m.modifier_group_id
     AND mg.venue_id = p_venue_id
    LEFT JOIN product_modifier_groups pmg
      ON pmg.modifier_group_id = mg.id
     AND pmg.product_id = v_dish_id
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
      JOIN modifiers m
        ON m.id = oim.modifier_id
      JOIN modifier_groups mg
        ON mg.id = m.modifier_group_id
       AND mg.venue_id = p_venue_id
      JOIN product_modifier_groups pmg
        ON pmg.modifier_group_id = mg.id
       AND pmg.product_id = v_dish_id
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

  IF p_strict_insufficient THEN
    FOR r_kv IN SELECT * FROM jsonb_each(v_agg)
    LOOP
      v_key := r_kv.key;
      v_delta := (r_kv.value #>> '{}')::numeric;
      IF v_delta >= 0 THEN
        CONTINUE;
      END IF;

      v_parts := string_to_array(v_key, '|');
      v_wh_u := v_parts[1]::uuid;
      v_prod_u := v_parts[2]::uuid;
      v_unit := v_parts[3];

      INSERT INTO stock_items (id, warehouse_id, product_id, quantity, unit, updated_at)
      VALUES (gen_random_uuid(), v_wh_u, v_prod_u, 0, v_unit, now())
      ON CONFLICT (warehouse_id, product_id) DO NOTHING;

      SELECT quantity INTO v_have
      FROM stock_items
      WHERE warehouse_id = v_wh_u
        AND product_id = v_prod_u
      FOR UPDATE;

      v_have := COALESCE(v_have, 0);
      IF v_have + v_delta < 0 THEN
        DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'insufficient_stock',
          'detail', jsonb_build_object(
            'warehouse_id', v_wh_u,
            'product_id', v_prod_u,
            'unit', v_unit,
            'available', v_have,
            'delta', v_delta
          )
        );
      END IF;
    END LOOP;
  END IF;

  FOR r_kv IN SELECT * FROM jsonb_each(v_agg)
  LOOP
    v_delta := (r_kv.value #>> '{}')::numeric;
    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

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

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_order_item_id := NULLIF(line->>'order_item_id', '')::uuid;
    v_dish_id := NULLIF(line->>'product_id', '')::uuid;
    v_line_qty := COALESCE((line->>'quantity')::int, 1);
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
      SELECT DISTINCT
        m.id AS mod_id,
        m.ingredient_id,
        m.quantity AS mq,
        m.unit AS mu
      FROM order_item_modifiers oim
      JOIN modifiers m
        ON m.id = oim.modifier_id
      JOIN modifier_groups mg
        ON mg.id = m.modifier_group_id
       AND mg.venue_id = p_venue_id
      JOIN product_modifier_groups pmg
        ON pmg.modifier_group_id = mg.id
       AND pmg.product_id = v_dish_id
      WHERE oim.order_item_id = v_order_item_id
        AND m.ingredient_id IS NOT NULL
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
