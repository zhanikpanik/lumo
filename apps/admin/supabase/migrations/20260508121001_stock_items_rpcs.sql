-- Stock source of truth: stock_items (warehouse_id + product_id).
-- Replaces product.stock_quantity mutations in warehouse document RPCs.

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
BEGIN
  SELECT quantity INTO v_cur
  FROM stock_items
  WHERE warehouse_id = p_wh AND product_id = p_product
  FOR UPDATE;

  INSERT INTO stock_items (warehouse_id, product_id, quantity, unit, updated_at)
  VALUES (p_wh, p_product, GREATEST(0, COALESCE(v_cur, 0) + COALESCE(p_delta, 0)), COALESCE(p_unit, 'кг'), NOW())
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET
    quantity = GREATEST(0, COALESCE(stock_items.quantity, 0) + COALESCE(p_delta, 0)),
    unit = COALESCE(EXCLUDED.unit, stock_items.unit),
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION apply_delivery_stock(p_delivery_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wh uuid;
  r record;
BEGIN
  SELECT warehouse_id INTO v_wh FROM warehouse_deliveries WHERE id = p_delivery_id;
  IF v_wh IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT product_id, quantity, unit
    FROM warehouse_delivery_items
    WHERE delivery_id = p_delivery_id AND product_id IS NOT NULL
  LOOP
    PERFORM apply_stock_delta(v_wh, r.product_id, COALESCE(r.quantity, 0), r.unit);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION apply_writeoff_stock(p_writeoff_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wh uuid;
  r record;
BEGIN
  SELECT warehouse_id INTO v_wh FROM warehouse_write_offs WHERE id = p_writeoff_id;
  IF v_wh IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT product_id, quantity, unit
    FROM warehouse_write_off_items
    WHERE write_off_id = p_writeoff_id AND product_id IS NOT NULL
  LOOP
    PERFORM apply_stock_delta(v_wh, r.product_id, -COALESCE(r.quantity, 0), r.unit);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION apply_inventory_stock(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wh uuid;
  r record;
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
    INSERT INTO stock_items (warehouse_id, product_id, quantity, unit, updated_at)
    VALUES (v_wh, r.product_id, GREATEST(0, COALESCE(r.actual, 0)), COALESCE(r.unit, 'кг'), NOW())
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET
      quantity = GREATEST(0, COALESCE(EXCLUDED.quantity, 0)),
      unit = COALESCE(EXCLUDED.unit, stock_items.unit),
      updated_at = NOW();
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION apply_transfer_stock(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from uuid;
  v_to uuid;
  r record;
BEGIN
  SELECT from_warehouse_id, to_warehouse_id
  INTO v_from, v_to
  FROM warehouse_transfers
  WHERE id = p_transfer_id;

  IF v_from IS NULL OR v_to IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT product_id, quantity, unit
    FROM warehouse_transfer_items
    WHERE transfer_id = p_transfer_id
      AND product_id IS NOT NULL
  LOOP
    PERFORM apply_stock_delta(v_from, r.product_id, -COALESCE(r.quantity, 0), r.unit);
    PERFORM apply_stock_delta(v_to, r.product_id, COALESCE(r.quantity, 0), r.unit);
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION apply_stock_delta(uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apply_stock_delta(uuid, uuid, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION apply_stock_delta(uuid, uuid, numeric, text) FROM authenticated;
