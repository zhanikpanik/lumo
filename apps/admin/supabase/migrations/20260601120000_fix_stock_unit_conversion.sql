-- Fix: normalize stock quantities to canonical units (г, мл, шт).
-- apply_stock_delta previously added numbers without unit conversion,
-- so 1.928 кг + (-10 г) = -8.072 → 0 (wrong).

-- 1) Normalize existing stock_items: convert кг→г (×1000), л→мл (×1000)
UPDATE public.stock_items
SET
  quantity = quantity * 1000,
  unit = 'г'
WHERE unit IN ('кг', 'kg') AND quantity > 0;

UPDATE public.stock_items
SET
  quantity = quantity * 1000,
  unit = 'мл'
WHERE unit IN ('л', 'l') AND quantity > 0;

-- 2) Rebuild apply_stock_delta with unit normalization
DROP FUNCTION IF EXISTS apply_stock_delta;
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
DECLARE
  v_cur numeric := 0;
  v_cur_unit text;
  v_delta_normalized numeric;
  v_unit_normalized text;
BEGIN
  -- Read current stock
  SELECT quantity, unit INTO v_cur, v_cur_unit
  FROM stock_items
  WHERE warehouse_id = p_wh AND product_id = p_product
  FOR UPDATE;

  -- Normalize the incoming delta to canonical unit (г, мл, шт)
  v_delta_normalized := COALESCE(p_delta, 0);
  v_unit_normalized := COALESCE(p_unit, 'кг');

  IF v_unit_normalized IN ('кг', 'kg') THEN
    v_delta_normalized := v_delta_normalized * 1000;
    v_unit_normalized := 'г';
  ELSIF v_unit_normalized IN ('л', 'l') THEN
    v_delta_normalized := v_delta_normalized * 1000;
    v_unit_normalized := 'мл';
  ELSIF v_unit_normalized IN ('г', 'g') THEN
    v_unit_normalized := 'г';
  ELSIF v_unit_normalized IN ('мл', 'ml') THEN
    v_unit_normalized := 'мл';
  ELSIF v_unit_normalized IN ('шт', 'pc', 'шт.') THEN
    v_unit_normalized := 'шт';
  ELSE
    v_unit_normalized := 'г';
  END IF;

  -- Normalize existing quantity as well (in case older records weren't migrated)
  IF v_cur_unit IN ('кг', 'kg') THEN
    v_cur := v_cur * 1000;
    v_cur_unit := 'г';
  ELSIF v_cur_unit IN ('л', 'l') THEN
    v_cur := v_cur * 1000;
    v_cur_unit := 'мл';
  ELSIF v_cur_unit IS NULL OR v_cur_unit = '' THEN
    v_cur_unit := v_unit_normalized;
  END IF;

  INSERT INTO stock_items (warehouse_id, product_id, quantity, unit, updated_at)
  VALUES (
    p_wh,
    p_product,
    GREATEST(0, COALESCE(v_cur, 0) + v_delta_normalized),
    COALESCE(v_unit_normalized, v_cur_unit, 'г'),
    NOW()
  )
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET
    quantity = GREATEST(0, COALESCE(stock_items.quantity, 0) + v_delta_normalized),
    unit = COALESCE(v_unit_normalized, stock_items.unit),
    updated_at = NOW();
END;
$$;

-- 3) Update products.stock_quantity and unit to reflect normalized values
UPDATE public.products p
SET
  stock_quantity = COALESCE((
    SELECT SUM(si.quantity)
    FROM public.stock_items si
    WHERE si.product_id = p.id
  ), 0),
  unit = CASE
    WHEN p.unit IN ('кг', 'kg') THEN 'г'
    WHEN p.unit IN ('л', 'l') THEN 'мл'
    WHEN p.unit IN ('г', 'g') THEN 'г'
    WHEN p.unit IN ('мл', 'ml') THEN 'мл'
    WHEN p.unit IN ('шт', 'pc', 'шт.') THEN 'шт'
    ELSE 'г'
  END
WHERE p.type = 'ingredient';

-- 4) Fix apply_inventory_stock — it writes directly to stock_items, bypassing apply_stock_delta
DROP FUNCTION IF EXISTS apply_inventory_stock;
CREATE OR REPLACE FUNCTION apply_inventory_stock(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wh uuid;
  r record;
  v_normalized_qty numeric;
  v_normalized_unit text;
BEGIN
  SELECT warehouse_id INTO v_wh FROM warehouse_inventory_sessions WHERE id = p_session_id;
  IF v_wh IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT product_id, actual, unit
    FROM warehouse_inventory_lines
    WHERE session_id = p_session_id
      AND product_id IS NOT NULL
      AND actual IS NOT NULL
  LOOP
    -- Normalize inventory values to canonical units (same logic as apply_stock_delta)
    v_normalized_qty := COALESCE(r.actual, 0);
    v_normalized_unit := COALESCE(r.unit, 'кг');

    IF v_normalized_unit IN ('кг', 'kg') THEN
      v_normalized_qty := v_normalized_qty * 1000;
      v_normalized_unit := 'г';
    ELSIF v_normalized_unit IN ('л', 'l') THEN
      v_normalized_qty := v_normalized_qty * 1000;
      v_normalized_unit := 'мл';
    ELSIF v_normalized_unit IN ('г', 'g') THEN
      v_normalized_unit := 'г';
    ELSIF v_normalized_unit IN ('мл', 'ml') THEN
      v_normalized_unit := 'мл';
    ELSIF v_normalized_unit IN ('шт', 'pc', 'шт.') THEN
      v_normalized_unit := 'шт';
    ELSE
      v_normalized_unit := 'г';
    END IF;

    INSERT INTO stock_items (warehouse_id, product_id, quantity, unit, updated_at)
    VALUES (v_wh, r.product_id, GREATEST(0, v_normalized_qty), v_normalized_unit, NOW())
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET
      quantity = GREATEST(0, COALESCE(EXCLUDED.quantity, 0)),
      unit = COALESCE(EXCLUDED.unit, stock_items.unit),
      updated_at = NOW();
  END LOOP;
END;
$$;

-- 5) Also re-apply revokes (they get lost on CREATE OR REPLACE)
REVOKE EXECUTE ON FUNCTION apply_stock_delta(uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apply_stock_delta(uuid, uuid, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION apply_stock_delta(uuid, uuid, numeric, text) FROM authenticated;
