-- Admin stability hardening:
-- 1) finalize_order_consumption should be idempotent on line inserts
-- 2) recipe_items should not contain duplicate ingredient rows per dish
-- 3) backfill legacy received deliveries missing warehouse_id

-- Backfill warehouse_id for received deliveries where it is still NULL.
-- Priority:
--   a) workshop_warehouses mapping by workshop_id
--   b) venue first warehouse fallback
WITH wh_map AS (
  SELECT ww.workshop_id, (array_agg(ww.warehouse_id ORDER BY ww.warehouse_id))[1] AS warehouse_id
  FROM workshop_warehouses ww
  GROUP BY ww.workshop_id
)
UPDATE warehouse_deliveries d
SET warehouse_id = wh_map.warehouse_id
FROM wh_map
WHERE d.status = 'received'
  AND d.warehouse_id IS NULL
  AND d.workshop_id = wh_map.workshop_id;

WITH venue_fallback AS (
  SELECT w.venue_id, (array_agg(w.id ORDER BY w.id))[1] AS warehouse_id
  FROM warehouses w
  GROUP BY w.venue_id
)
UPDATE warehouse_deliveries d
SET warehouse_id = vf.warehouse_id
FROM venue_fallback vf
WHERE d.status = 'received'
  AND d.warehouse_id IS NULL
  AND d.venue_id = vf.venue_id;

-- Merge duplicate recipe rows (same dish + ingredient) into one row with summed quantity.
WITH ranked AS (
  SELECT
    ri.id,
    ri.product_id,
    ri.ingredient_id,
    ri.quantity,
    ri.unit,
    ROW_NUMBER() OVER (
      PARTITION BY ri.product_id, ri.ingredient_id
      ORDER BY ri.id
    ) AS rn,
    SUM(ri.quantity) OVER (
      PARTITION BY ri.product_id, ri.ingredient_id
    ) AS total_qty,
    FIRST_VALUE(ri.unit) OVER (
      PARTITION BY ri.product_id, ri.ingredient_id
      ORDER BY ri.id
    ) AS keep_unit
  FROM recipe_items ri
  WHERE ri.ingredient_id IS NOT NULL
),
updated AS (
  UPDATE recipe_items r
  SET quantity = ranked.total_qty,
      unit = COALESCE(NULLIF(ranked.keep_unit, ''), r.unit)
  FROM ranked
  WHERE r.id = ranked.id
    AND ranked.rn = 1
  RETURNING r.id
)
DELETE FROM recipe_items r
USING ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_items_product_ingredient
  ON recipe_items(product_id, ingredient_id)
  WHERE ingredient_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.finalize_order_consumption(
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
SET search_path TO 'public'
AS $function$
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
  v_inserted int;
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
      SELECT
        ri.ingredient_id,
        SUM(ri.quantity) AS base_q,
        MIN(ri.unit) AS unit
      FROM recipe_items ri
      WHERE ri.product_id = v_dish_id
      GROUP BY ri.ingredient_id
    LOOP
      v_delta := -(v_rec.base_q * v_line_qty);
      v_line_key :=
        p_idempotency_key || ':' || v_order_item_id::text || ':r:' || v_rec.ingredient_id::text;

      v_inserted := NULL;
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
      )
      ON CONFLICT (line_idempotency_key) DO NOTHING
      RETURNING 1 INTO v_inserted;

      IF v_inserted IS NOT NULL THEN
        PERFORM apply_stock_delta(
          v_wh_id,
          v_rec.ingredient_id,
          v_delta,
          COALESCE(NULLIF(TRIM(v_rec.unit), ''), 'г')
        );
      END IF;
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

      v_inserted := NULL;
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
      )
      ON CONFLICT (line_idempotency_key) DO NOTHING
      RETURNING 1 INTO v_inserted;

      IF v_inserted IS NOT NULL THEN
        PERFORM apply_stock_delta(
          v_wh_id,
          v_mod.ingredient_id,
          v_delta,
          COALESCE(NULLIF(TRIM(v_mod.mu), ''), 'г')
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'duplicate', false);
END;
$function$;
