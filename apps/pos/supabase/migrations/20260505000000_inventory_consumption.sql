-- Inventory sale consumption: ledger, idempotent batches, workshop→warehouse, RPC

-- Default main warehouse for dev venue (idempotent seed)
INSERT INTO warehouses (id, venue_id, name)
SELECT
  '00000000-0000-0000-0000-000000006001',
  '00000000-0000-0000-0000-000000000010',
  'Основной склад'
WHERE NOT EXISTS (
  SELECT 1 FROM warehouses WHERE id = '00000000-0000-0000-0000-000000006001'
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_items_warehouse_product ON stock_items (warehouse_id, product_id);

CREATE TABLE IF NOT EXISTS workshop_warehouses (
  workshop_id uuid PRIMARY KEY REFERENCES workshops(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

INSERT INTO workshop_warehouses (workshop_id, warehouse_id)
VALUES
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-000000006001'),
  ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-000000006001')
ON CONFLICT (workshop_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'inventory_movement_reason'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE inventory_movement_reason AS ENUM ('sale', 'waste', 'supply', 'adjustment');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS order_sale_consumption_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id),
  occurred_at timestamptz NOT NULL,
  shift_id uuid REFERENCES shifts(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  product_id uuid NOT NULL REFERENCES products(id),
  quantity_delta numeric(10,3) NOT NULL,
  unit text NOT NULL DEFAULT 'г',
  reason inventory_movement_reason NOT NULL,
  ref_type text NOT NULL DEFAULT 'order',
  ref_id uuid NOT NULL,
  line_idempotency_key text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_venue_occurred ON inventory_movements (venue_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_ref ON inventory_movements (ref_type, ref_id);

ALTER TABLE order_sale_consumption_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all reads" ON order_sale_consumption_batches;
DROP POLICY IF EXISTS "Allow all inserts" ON order_sale_consumption_batches;
DROP POLICY IF EXISTS "Allow all deletes" ON order_sale_consumption_batches;
CREATE POLICY "Allow all reads" ON order_sale_consumption_batches FOR SELECT USING (true);
CREATE POLICY "Allow all inserts" ON order_sale_consumption_batches FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all deletes" ON order_sale_consumption_batches FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow all reads" ON inventory_movements;
DROP POLICY IF EXISTS "Allow all inserts" ON inventory_movements;
DROP POLICY IF EXISTS "Allow all updates" ON inventory_movements;
DROP POLICY IF EXISTS "Allow all deletes" ON inventory_movements;
CREATE POLICY "Allow all reads" ON inventory_movements FOR SELECT USING (true);
CREATE POLICY "Allow all inserts" ON inventory_movements FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates" ON inventory_movements FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes" ON inventory_movements FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow all reads" ON workshop_warehouses;
DROP POLICY IF EXISTS "Allow all inserts" ON workshop_warehouses;
DROP POLICY IF EXISTS "Allow all updates" ON workshop_warehouses;
DROP POLICY IF EXISTS "Allow all deletes" ON workshop_warehouses;
CREATE POLICY "Allow all reads" ON workshop_warehouses FOR SELECT USING (true);
CREATE POLICY "Allow all inserts" ON workshop_warehouses FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates" ON workshop_warehouses FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes" ON workshop_warehouses FOR DELETE USING (true);

-- Stock delta helper (SECURITY DEFINER for consistent updates from RPC)
CREATE OR REPLACE FUNCTION apply_stock_delta(
  p_wh uuid,
  p_product uuid,
  p_delta numeric,
  p_unit text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO stock_items (id, warehouse_id, product_id, quantity, unit, updated_at)
  VALUES (gen_random_uuid(), p_wh, p_product, p_delta, p_unit, now())
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET
    quantity = stock_items.quantity + EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION apply_stock_delta(uuid, uuid, numeric, text) TO anon;
GRANT EXECUTE ON FUNCTION apply_stock_delta(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_stock_delta(uuid, uuid, numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION finalize_order_consumption(
  p_venue_id uuid,
  p_order_id uuid,
  p_occurred_at timestamptz,
  p_idempotency_key text,
  p_lines jsonb,
  p_shift_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status order_status;
  v_has_payment boolean;
  v_batch_id uuid;
  line jsonb;
  v_order_item_id uuid;
  v_dish_id uuid;
  v_line_qty int;
  v_workshop_id uuid;
  v_wh_id uuid;
  v_rec record;
  v_mod record;
  v_delta numeric;
  v_line_key text;
BEGIN
  INSERT INTO order_sale_consumption_batches (
    idempotency_key, order_id, venue_id, occurred_at, shift_id
  )
  VALUES (
    p_idempotency_key, p_order_id, p_venue_id, p_occurred_at, p_shift_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_batch_id;

  IF v_batch_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  SELECT status INTO v_status
  FROM orders
  WHERE id = p_order_id AND venue_id = p_venue_id;

  IF v_status IS NULL THEN
    DELETE FROM order_sale_consumption_batches WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_status IS DISTINCT FROM 'paid' THEN
    DELETE FROM order_sale_consumption_batches WHERE idempotency_key = p_idempotency_key;
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
    DELETE FROM order_sale_consumption_batches WHERE idempotency_key = p_idempotency_key;
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

    SELECT workshop_id INTO v_workshop_id FROM products WHERE id = v_dish_id;

    IF v_workshop_id IS NOT NULL THEN
      SELECT ww.warehouse_id INTO v_wh_id
      FROM workshop_warehouses ww
      WHERE ww.workshop_id = v_workshop_id
      LIMIT 1;
    ELSE
      v_wh_id := NULL;
    END IF;

    IF v_wh_id IS NULL THEN
      SELECT w.id INTO v_wh_id
      FROM warehouses w
      WHERE w.venue_id = p_venue_id
      ORDER BY w.created_at NULLS LAST
      LIMIT 1;
    END IF;

    IF v_wh_id IS NULL THEN
      DELETE FROM order_sale_consumption_batches WHERE idempotency_key = p_idempotency_key;
      RETURN jsonb_build_object('ok', false, 'error', 'no_warehouse');
    END IF;

    FOR v_rec IN
      SELECT ri.ingredient_id, ri.quantity AS base_q, ri.unit
      FROM recipe_items ri
      WHERE ri.product_id = v_dish_id
    LOOP
      v_delta := -(v_rec.base_q * v_line_qty);
      v_line_key :=
        p_idempotency_key || ':' || v_order_item_id::text || ':r:' || v_rec.ingredient_id::text;

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
          'source', 'recipe'
        )
      );

      PERFORM apply_stock_delta(
        v_wh_id,
        v_rec.ingredient_id,
        v_delta,
        COALESCE(NULLIF(TRIM(v_rec.unit), ''), 'г')
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
        p_idempotency_key || ':' || v_order_item_id::text || ':m:' || v_mod.mod_id::text;

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
          'source', 'modifier'
        )
      );

      PERFORM apply_stock_delta(
        v_wh_id,
        v_mod.ingredient_id,
        v_delta,
        COALESCE(NULLIF(TRIM(v_mod.mu), ''), 'г')
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'duplicate', false);
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_order_consumption(uuid, uuid, timestamptz, text, jsonb, uuid) TO anon;
GRANT EXECUTE ON FUNCTION finalize_order_consumption(uuid, uuid, timestamptz, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_order_consumption(uuid, uuid, timestamptz, text, jsonb, uuid) TO service_role;
