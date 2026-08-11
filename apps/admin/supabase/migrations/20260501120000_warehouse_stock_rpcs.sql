-- Atomic stock RPCs — run inside a single transaction on the server.
-- Called from admin hooks; if these don't exist the client falls back to row-by-row.

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
