-- Add inventory_movements to cleanup (FK to products)
CREATE OR REPLACE FUNCTION demo_clean_venue(p_venue_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM order_events WHERE venue_id = p_venue_id;
  DELETE FROM order_item_modifiers WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE venue_id = p_venue_id));
  DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE venue_id = p_venue_id);
  DELETE FROM payments WHERE venue_id = p_venue_id;
  DELETE FROM cash_movements WHERE venue_id = p_venue_id;
  DELETE FROM cash_transactions WHERE venue_id = p_venue_id;
  DELETE FROM orders WHERE venue_id = p_venue_id;
  
  DELETE FROM warehouse_delivery_items WHERE delivery_id IN (SELECT id FROM warehouse_deliveries WHERE venue_id = p_venue_id);
  DELETE FROM warehouse_write_off_items WHERE write_off_id IN (SELECT id FROM warehouse_write_offs WHERE venue_id = p_venue_id);
  DELETE FROM warehouse_inventory_lines WHERE session_id IN (SELECT id FROM warehouse_inventory_sessions WHERE venue_id = p_venue_id);
  
  DELETE FROM warehouse_deliveries WHERE venue_id = p_venue_id;
  DELETE FROM warehouse_write_offs WHERE venue_id = p_venue_id;
  DELETE FROM warehouse_inventory_sessions WHERE venue_id = p_venue_id;
  
  DELETE FROM stock_items WHERE warehouse_id IN (SELECT id FROM warehouses WHERE venue_id = p_venue_id);
  DELETE FROM supply_items WHERE supply_document_id IN (SELECT id FROM supply_documents WHERE venue_id = p_venue_id);
  DELETE FROM supply_documents WHERE venue_id = p_venue_id;
  
  DELETE FROM warehouse_products WHERE warehouse_id IN (SELECT id FROM warehouses WHERE venue_id = p_venue_id);
  DELETE FROM recipe_items WHERE product_id IN (SELECT id FROM products WHERE venue_id = p_venue_id) OR ingredient_id IN (SELECT id FROM products WHERE venue_id = p_venue_id);
  DELETE FROM product_modifier_groups WHERE product_id IN (SELECT id FROM products WHERE venue_id = p_venue_id);
  DELETE FROM inventory_movements WHERE product_id IN (SELECT id FROM products WHERE venue_id = p_venue_id);
  
  DELETE FROM products WHERE venue_id = p_venue_id;
  DELETE FROM categories WHERE venue_id = p_venue_id;
  
  DELETE FROM shifts WHERE venue_id = p_venue_id;
  DELETE FROM warehouses WHERE venue_id = p_venue_id;
  DELETE FROM suppliers WHERE venue_id = p_venue_id;
  
  DELETE FROM tables WHERE venue_id = p_venue_id;
  DELETE FROM zones WHERE venue_id = p_venue_id;
  
  DELETE FROM modifiers WHERE modifier_group_id IN (SELECT id FROM modifier_groups WHERE venue_id = p_venue_id);
  DELETE FROM modifier_groups WHERE venue_id = p_venue_id;
  
  RETURN 'ok';
END;
$$;
