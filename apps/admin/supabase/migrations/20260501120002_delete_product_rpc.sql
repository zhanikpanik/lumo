-- Atomically delete a product and its dependencies in one transaction.
CREATE OR REPLACE FUNCTION delete_product(p_product_id UUID, p_venue_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM recipe_items WHERE product_id = p_product_id;
  DELETE FROM product_modifier_groups WHERE product_id = p_product_id;
  DELETE FROM products WHERE id = p_product_id AND venue_id = p_venue_id;
END;
$$;
