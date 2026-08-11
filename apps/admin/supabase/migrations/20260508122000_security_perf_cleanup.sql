-- Security/performance cleanup after warehouse alignment.

-- Performance: add missing FK indexes (safe no-op with IF NOT EXISTS).
DO $$
BEGIN
  IF to_regclass('public.cash_transactions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_cash_transactions_shift ON cash_transactions(shift_id);
    CREATE INDEX IF NOT EXISTS idx_cash_transactions_category ON cash_transactions(category_id);
  END IF;
  IF to_regclass('public.inventory_movements') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_warehouse ON inventory_movements(warehouse_id);
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS idx_modifier_groups_venue ON modifier_groups(venue_id);
CREATE INDEX IF NOT EXISTS idx_modifiers_group ON modifiers(modifier_group_id);
CREATE INDEX IF NOT EXISTS idx_modifiers_ingredient ON modifiers(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_order_item ON order_item_modifiers(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_modifier ON order_item_modifiers(modifier_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_shift ON payments(shift_id);
CREATE INDEX IF NOT EXISTS idx_payments_venue ON payments(venue_id);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='supplier_id') THEN
    CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='workshop_id') THEN
    CREATE INDEX IF NOT EXISTS idx_products_workshop ON products(workshop_id);
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS idx_recipe_items_product ON recipe_items(product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_ingredient ON recipe_items(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_shifts_cashier ON shifts(cashier_id);
CREATE INDEX IF NOT EXISTS idx_tables_venue ON tables(venue_id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_venues_org ON venues(organization_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_venue ON warehouses(venue_id);
CREATE INDEX IF NOT EXISTS idx_workshops_venue ON workshops(venue_id);
CREATE INDEX IF NOT EXISTS idx_zones_venue ON zones(venue_id);

-- Security: do not expose admin/maintenance RPCs to anonymous users.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'finalize_order_consumption'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.finalize_order_consumption(uuid, uuid, timestamptz, text, jsonb, uuid) FROM anon;
  END IF;
END $$;
