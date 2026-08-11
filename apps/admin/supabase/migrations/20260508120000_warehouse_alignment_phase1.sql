-- Warehouse/workshop alignment (phase 1).
-- Goal: move warehouse documents to warehouse_id semantics (1:1 workshop->warehouse),
-- while preserving legacy workshop columns for temporary compatibility.

-- 1) Ingredient visibility per physical warehouse (shared product catalog).
CREATE TABLE IF NOT EXISTS warehouse_products (
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (warehouse_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_products_product ON warehouse_products(product_id);

-- 2) Document headers: add warehouse_id fields.
ALTER TABLE warehouse_deliveries
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

ALTER TABLE warehouse_write_offs
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

ALTER TABLE warehouse_inventory_sessions
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

ALTER TABLE warehouse_transfers
  ADD COLUMN IF NOT EXISTS from_warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS to_warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT;

-- 3) Backfill warehouse_id from workshop_warehouses (1:1 target, first link wins).
WITH map AS (
  SELECT ww.workshop_id, (array_agg(ww.warehouse_id))[1] AS warehouse_id
  FROM workshop_warehouses ww
  GROUP BY ww.workshop_id
)
UPDATE warehouse_deliveries d
SET warehouse_id = m.warehouse_id
FROM map m
WHERE d.warehouse_id IS NULL
  AND d.workshop_id = m.workshop_id;

WITH map AS (
  SELECT ww.workshop_id, (array_agg(ww.warehouse_id))[1] AS warehouse_id
  FROM workshop_warehouses ww
  GROUP BY ww.workshop_id
)
UPDATE warehouse_write_offs w
SET warehouse_id = m.warehouse_id
FROM map m
WHERE w.warehouse_id IS NULL
  AND w.workshop_id = m.workshop_id;

WITH map AS (
  SELECT ww.workshop_id, (array_agg(ww.warehouse_id))[1] AS warehouse_id
  FROM workshop_warehouses ww
  GROUP BY ww.workshop_id
)
UPDATE warehouse_inventory_sessions s
SET warehouse_id = m.warehouse_id
FROM map m
WHERE s.warehouse_id IS NULL
  AND s.workshop_id = m.workshop_id;

WITH map AS (
  SELECT ww.workshop_id, (array_agg(ww.warehouse_id))[1] AS warehouse_id
  FROM workshop_warehouses ww
  GROUP BY ww.workshop_id
)
UPDATE warehouse_transfers t
SET from_warehouse_id = m.warehouse_id
FROM map m
WHERE t.from_warehouse_id IS NULL
  AND t.from_workshop_id = m.workshop_id;

WITH map AS (
  SELECT ww.workshop_id, (array_agg(ww.warehouse_id))[1] AS warehouse_id
  FROM workshop_warehouses ww
  GROUP BY ww.workshop_id
)
UPDATE warehouse_transfers t
SET to_warehouse_id = m.warehouse_id
FROM map m
WHERE t.to_warehouse_id IS NULL
  AND t.to_workshop_id = m.workshop_id;

-- 4) Seed warehouse_products for all existing ingredient/warehouse combinations.
INSERT INTO warehouse_products (warehouse_id, product_id)
SELECT DISTINCT ww.warehouse_id, p.id
FROM products p
JOIN workshop_warehouses ww ON ww.workshop_id = p.workshop_id
WHERE p.type = 'ingredient'
ON CONFLICT (warehouse_id, product_id) DO NOTHING;

-- 5) Coverage indexes (new and existing FKs used by documents/inventory screens).
CREATE INDEX IF NOT EXISTS idx_warehouse_deliveries_warehouse ON warehouse_deliveries(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_write_offs_warehouse ON warehouse_write_offs(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_sessions_warehouse ON warehouse_inventory_sessions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_from_warehouse ON warehouse_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_to_warehouse ON warehouse_transfers(to_warehouse_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_delivery_items_delivery ON warehouse_delivery_items(delivery_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_delivery_items_product ON warehouse_delivery_items(product_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_write_off_items_writeoff ON warehouse_write_off_items(write_off_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_write_off_items_product ON warehouse_write_off_items(product_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfer_items_transfer ON warehouse_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfer_items_product ON warehouse_transfer_items(product_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfer_items_dest_product ON warehouse_transfer_items(dest_product_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_lines_session ON warehouse_inventory_lines(session_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_lines_product ON warehouse_inventory_lines(product_id);
