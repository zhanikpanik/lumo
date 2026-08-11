-- ============================================================
-- Migration: Simplify transfers — drop workshop_stock, use product-to-product
-- Transfers now move stock_quantity between product rows directly.
-- If destination workshop doesn't have the ingredient, it's auto-created.
-- ============================================================

-- 1. Add dest_product_id to transfer items
ALTER TABLE warehouse_transfer_items
  ADD COLUMN IF NOT EXISTS dest_product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- 2. Drop workshop_stock (no longer needed)
DROP TABLE IF EXISTS workshop_stock CASCADE;

-- 3. Replace apply_transfer_stock — moves stock between product rows
CREATE OR REPLACE FUNCTION apply_transfer_stock(p_transfer_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_from UUID;
  v_to UUID;
  v_venue UUID;
  r RECORD;
  v_dest_id UUID;
BEGIN
  SELECT from_workshop_id, to_workshop_id, venue_id
  INTO v_from, v_to, v_venue
  FROM warehouse_transfers WHERE id = p_transfer_id;

  FOR r IN
    SELECT ti.id, ti.product_id, ti.name, ti.unit, ti.quantity
    FROM warehouse_transfer_items ti
    WHERE ti.transfer_id = p_transfer_id AND ti.product_id IS NOT NULL
  LOOP
    -- Subtract from source product
    UPDATE products
    SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - COALESCE(r.quantity, 0))
    WHERE id = r.product_id;

    -- Find matching product in destination workshop
    SELECT id INTO v_dest_id
    FROM products
    WHERE venue_id = v_venue
      AND type = 'ingredient'
      AND workshop_id = v_to
      AND name = r.name
      AND unit = r.unit
    LIMIT 1;

    IF v_dest_id IS NULL THEN
      -- Auto-create ingredient in destination workshop
      INSERT INTO products (venue_id, type, name, unit, price, stock_quantity, workshop_id, is_active)
      SELECT v_venue, 'ingredient', p.name, p.unit, p.price, COALESCE(r.quantity, 0), v_to, true
      FROM products p WHERE p.id = r.product_id
      RETURNING id INTO v_dest_id;
    ELSE
      UPDATE products
      SET stock_quantity = COALESCE(stock_quantity, 0) + COALESCE(r.quantity, 0)
      WHERE id = v_dest_id;
    END IF;

    -- Save dest reference for audit
    UPDATE warehouse_transfer_items SET dest_product_id = v_dest_id WHERE id = r.id;
  END LOOP;
END;
$$;

-- 4. Revert apply_delivery_stock — simple product update only
CREATE OR REPLACE FUNCTION apply_delivery_stock(p_delivery_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE products p
  SET stock_quantity = COALESCE(p.stock_quantity, 0) + COALESCE(di.quantity, 0)
  FROM warehouse_delivery_items di
  WHERE di.delivery_id = p_delivery_id
    AND di.product_id IS NOT NULL
    AND p.id = di.product_id;
END;
$$;

-- 5. Revert apply_writeoff_stock — simple product update only
CREATE OR REPLACE FUNCTION apply_writeoff_stock(p_writeoff_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE products p
  SET stock_quantity = GREATEST(0, COALESCE(p.stock_quantity, 0) - COALESCE(wi.quantity, 0))
  FROM warehouse_write_off_items wi
  WHERE wi.write_off_id = p_writeoff_id
    AND wi.product_id IS NOT NULL
    AND p.id = wi.product_id;
END;
$$;

-- 6. Revert apply_inventory_stock — simple product update only
CREATE OR REPLACE FUNCTION apply_inventory_stock(p_session_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE products p
  SET stock_quantity = il.actual
  FROM warehouse_inventory_lines il
  WHERE il.session_id = p_session_id
    AND il.product_id IS NOT NULL
    AND il.actual IS NOT NULL
    AND p.id = il.product_id;
END;
$$;
