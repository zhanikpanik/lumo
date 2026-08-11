-- ============================================================
-- Migration: workshop_stock & warehouse_transfers
-- Adds per-workshop stock tracking and inter-workshop transfers
-- ============================================================

-- 1. workshop_stock — per-workshop inventory balances
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workshop_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  UNIQUE(product_id, workshop_id)
);

CREATE INDEX IF NOT EXISTS idx_workshop_stock_product ON workshop_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_workshop_stock_workshop ON workshop_stock(workshop_id);

-- 2. warehouse_transfers — transfer document headers
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS warehouse_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  from_workshop_id UUID NOT NULL REFERENCES workshops(id),
  to_workshop_id UUID NOT NULL REFERENCES workshops(id),
  transfer_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_venue ON warehouse_transfers(venue_id);

-- 3. warehouse_transfer_items — transfer document lines
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS warehouse_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES warehouse_transfers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'кг'
);

-- 4. Add workshop_id to deliveries and write-offs
-- ------------------------------------------------------------

ALTER TABLE warehouse_deliveries
  ADD COLUMN IF NOT EXISTS workshop_id UUID REFERENCES workshops(id) ON DELETE SET NULL;

ALTER TABLE warehouse_write_offs
  ADD COLUMN IF NOT EXISTS workshop_id UUID REFERENCES workshops(id) ON DELETE SET NULL;

-- 5. Seed workshop_stock from existing ingredient data
-- ------------------------------------------------------------

INSERT INTO workshop_stock (product_id, workshop_id, quantity)
SELECT id, workshop_id, 0
FROM products
WHERE type = 'ingredient' AND workshop_id IS NOT NULL
ON CONFLICT (product_id, workshop_id) DO NOTHING;

-- 6. Replace RPCs to use workshop_stock
-- ------------------------------------------------------------

-- 6a. apply_delivery_stock — reads workshop_id from delivery header
CREATE OR REPLACE FUNCTION apply_delivery_stock(p_delivery_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_workshop_id UUID;
BEGIN
  SELECT workshop_id INTO v_workshop_id FROM warehouse_deliveries WHERE id = p_delivery_id;

  IF v_workshop_id IS NOT NULL THEN
    INSERT INTO workshop_stock (product_id, workshop_id, quantity)
    SELECT di.product_id, v_workshop_id, COALESCE(di.quantity, 0)
    FROM warehouse_delivery_items di
    WHERE di.delivery_id = p_delivery_id AND di.product_id IS NOT NULL
    ON CONFLICT (product_id, workshop_id)
    DO UPDATE SET quantity = workshop_stock.quantity + EXCLUDED.quantity;
  END IF;

  UPDATE products p
  SET stock_quantity = COALESCE(p.stock_quantity, 0) + COALESCE(di.quantity, 0)
  FROM warehouse_delivery_items di
  WHERE di.delivery_id = p_delivery_id
    AND di.product_id IS NOT NULL
    AND p.id = di.product_id;
END;
$$;

-- 6b. apply_writeoff_stock — reads workshop_id from write-off header
CREATE OR REPLACE FUNCTION apply_writeoff_stock(p_writeoff_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_workshop_id UUID;
BEGIN
  SELECT workshop_id INTO v_workshop_id FROM warehouse_write_offs WHERE id = p_writeoff_id;

  IF v_workshop_id IS NOT NULL THEN
    UPDATE workshop_stock ws
    SET quantity = GREATEST(0, ws.quantity - COALESCE(wi.quantity, 0))
    FROM warehouse_write_off_items wi
    WHERE wi.write_off_id = p_writeoff_id
      AND wi.product_id IS NOT NULL
      AND ws.product_id = wi.product_id
      AND ws.workshop_id = v_workshop_id;
  END IF;

  UPDATE products p
  SET stock_quantity = GREATEST(0, COALESCE(p.stock_quantity, 0) - COALESCE(wi.quantity, 0))
  FROM warehouse_write_off_items wi
  WHERE wi.write_off_id = p_writeoff_id
    AND wi.product_id IS NOT NULL
    AND p.id = wi.product_id;
END;
$$;

-- 6c. apply_inventory_stock — reads workshop_id from inventory session
CREATE OR REPLACE FUNCTION apply_inventory_stock(p_session_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_workshop_id UUID;
BEGIN
  SELECT workshop_id INTO v_workshop_id FROM warehouse_inventory_sessions WHERE id = p_session_id;

  IF v_workshop_id IS NOT NULL THEN
    INSERT INTO workshop_stock (product_id, workshop_id, quantity)
    SELECT il.product_id, v_workshop_id, COALESCE(il.actual, 0)
    FROM warehouse_inventory_lines il
    WHERE il.session_id = p_session_id
      AND il.product_id IS NOT NULL
      AND il.actual IS NOT NULL
    ON CONFLICT (product_id, workshop_id)
    DO UPDATE SET quantity = EXCLUDED.quantity;
  END IF;

  UPDATE products p
  SET stock_quantity = il.actual
  FROM warehouse_inventory_lines il
  WHERE il.session_id = p_session_id
    AND il.product_id IS NOT NULL
    AND il.actual IS NOT NULL
    AND p.id = il.product_id;
END;
$$;

-- 6d. apply_transfer_stock — new RPC for inter-workshop transfers
CREATE OR REPLACE FUNCTION apply_transfer_stock(p_transfer_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_from UUID;
  v_to UUID;
BEGIN
  SELECT from_workshop_id, to_workshop_id INTO v_from, v_to
  FROM warehouse_transfers WHERE id = p_transfer_id;

  UPDATE workshop_stock ws
  SET quantity = GREATEST(0, ws.quantity - COALESCE(ti.quantity, 0))
  FROM warehouse_transfer_items ti
  WHERE ti.transfer_id = p_transfer_id
    AND ti.product_id IS NOT NULL
    AND ws.product_id = ti.product_id
    AND ws.workshop_id = v_from;

  INSERT INTO workshop_stock (product_id, workshop_id, quantity)
  SELECT ti.product_id, v_to, COALESCE(ti.quantity, 0)
  FROM warehouse_transfer_items ti
  WHERE ti.transfer_id = p_transfer_id AND ti.product_id IS NOT NULL
  ON CONFLICT (product_id, workshop_id)
  DO UPDATE SET quantity = workshop_stock.quantity + EXCLUDED.quantity;
END;
$$;

-- 7. Row Level Security
-- ------------------------------------------------------------

ALTER TABLE workshop_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workshop_stock_all" ON workshop_stock;
CREATE POLICY "workshop_stock_all" ON workshop_stock FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "warehouse_transfers_all" ON warehouse_transfers;
CREATE POLICY "warehouse_transfers_all" ON warehouse_transfers FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "warehouse_transfer_items_all" ON warehouse_transfer_items;
CREATE POLICY "warehouse_transfer_items_all" ON warehouse_transfer_items FOR ALL USING (true) WITH CHECK (true);