-- Warehouse-centric POS stock deduction (see docs/pos-warehouse-stock.md)
-- Requires apply_stock_delta from 20260505000000_inventory_consumption.sql

-- 1) Workshop → default warehouse
ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS default_warehouse_id uuid REFERENCES warehouses(id);

UPDATE workshops w
SET default_warehouse_id = ww.warehouse_id
FROM workshop_warehouses ww
WHERE ww.workshop_id = w.id
  AND w.default_warehouse_id IS NULL;

-- 2) Dev-only kitchen/bar warehouse split moved out of migration history.
-- See supabase/seeds/dev_pos_warehouse_seed.sql.

-- 3) Idempotency row per order (POS warehouse path)
CREATE TABLE IF NOT EXISTS pos_order_stock_settlements (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id),
  settled_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_order_stock_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all reads" ON pos_order_stock_settlements FOR SELECT USING (true);
CREATE POLICY "Allow all inserts" ON pos_order_stock_settlements FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates" ON pos_order_stock_settlements FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes" ON pos_order_stock_settlements FOR DELETE USING (true);

-- Backfill from legacy consumption batches (avoid double-charging when migrating from finalize_order_consumption)
INSERT INTO pos_order_stock_settlements (order_id, venue_id)
SELECT order_id, venue_id
FROM order_sale_consumption_batches
ON CONFLICT (order_id) DO NOTHING;

-- 4) New POS RPC (idempotent by order_id via pos_order_stock_settlements only)
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
BEGIN
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
  WHERE id = p_order_id AND venue_id = p_venue_id;

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
    v_order_item_id := (line->>'order_item_id')::uuid;
    v_dish_id := (line->>'product_id')::uuid;
    v_line_qty := COALESCE((line->>'quantity')::int, 1);

    IF v_line_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT type, workshop_id
    INTO v_pt, v_workshop_id
    FROM products
    WHERE id = v_dish_id;

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

    SELECT default_warehouse_id INTO v_wh_id
    FROM workshops
    WHERE id = v_workshop_id;

    IF v_wh_id IS NULL THEN
      DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'missing_default_warehouse_id',
        'detail', jsonb_build_object('workshop_id', v_workshop_id, 'product_id', v_dish_id)
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

      SELECT quantity INTO v_have
      FROM stock_items
      WHERE warehouse_id = v_wh_u AND product_id = v_prod_u;

      v_have := COALESCE(v_have, 0);
      IF v_have + v_delta < 0 THEN
        DELETE FROM pos_order_stock_settlements WHERE order_id = p_order_id;
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'insufficient_stock',
          'detail', jsonb_build_object(
            'warehouse_id', v_wh_u,
            'product_id', v_prod_u,
            'unit', v_parts[3],
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

    PERFORM apply_stock_delta(v_wh_u, v_prod_u, v_delta, v_unit);
  END LOOP;

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_order_item_id := (line->>'order_item_id')::uuid;
    v_dish_id := (line->>'product_id')::uuid;
    v_line_qty := COALESCE((line->>'quantity')::int, 1);
    IF v_line_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT type, workshop_id INTO v_pt, v_workshop_id FROM products WHERE id = v_dish_id;
    IF v_pt IS DISTINCT FROM 'dish'::product_type THEN
      CONTINUE;
    END IF;

    SELECT default_warehouse_id INTO v_wh_id FROM workshops WHERE id = v_workshop_id;
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
          'source', 'modifier',
          'rpc', 'pos_finalize_order_stock'
        )
      );
    END LOOP;
  END LOOP;

  -- Log paid event (once per order — idempotent via settlement guard above)
  INSERT INTO order_events (order_id, action, occurred_at, venue_id)
  VALUES (p_order_id, 'paid', p_occurred_at, p_venue_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'duplicate', false);
END;
$$;

GRANT EXECUTE ON FUNCTION pos_finalize_order_stock(uuid, uuid, timestamptz, jsonb, uuid, boolean) TO anon;
GRANT EXECUTE ON FUNCTION pos_finalize_order_stock(uuid, uuid, timestamptz, jsonb, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_finalize_order_stock(uuid, uuid, timestamptz, jsonb, uuid, boolean) TO service_role;
