-- Run once in Supabase Dashboard → SQL Editor → paste → Run.
-- Requires existing tables: products, workshops (FKs). Safe to re-run (IF NOT EXISTS + DROP POLICY IF EXISTS).

-- === Warehouse (from migrations/20260430120000_admin_warehouse.sql) ===

CREATE TABLE IF NOT EXISTS warehouse_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_transit', 'received', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'procurement_app')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_delivery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES warehouse_deliveries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'шт',
  price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_warehouse_deliveries_venue ON warehouse_deliveries(venue_id);

CREATE TABLE IF NOT EXISTS warehouse_write_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  reason_summary TEXT NOT NULL DEFAULT '',
  write_off_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'cancelled')),
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_write_off_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  write_off_id UUID NOT NULL REFERENCES warehouse_write_offs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'шт',
  reason TEXT NOT NULL DEFAULT '',
  product_id UUID REFERENCES products(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_warehouse_write_offs_venue ON warehouse_write_offs(venue_id);

CREATE TABLE IF NOT EXISTS warehouse_inventory_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  workshop_id UUID REFERENCES workshops(id) ON DELETE SET NULL,
  inventory_type TEXT NOT NULL DEFAULT 'full'
    CHECK (inventory_type IN ('full', 'partial')),
  conducted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'cancelled')),
  result_delta NUMERIC(14, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_inventory_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES warehouse_inventory_sessions(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'кг',
  theoretical NUMERIC(14, 4) NOT NULL DEFAULT 0,
  actual NUMERIC(14, 4),
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_sessions_venue ON warehouse_inventory_sessions(venue_id);

ALTER TABLE warehouse_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_write_offs ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_write_off_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_inventory_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_inventory_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warehouse_deliveries_all" ON warehouse_deliveries;
DROP POLICY IF EXISTS "warehouse_delivery_items_all" ON warehouse_delivery_items;
DROP POLICY IF EXISTS "warehouse_write_offs_all" ON warehouse_write_offs;
DROP POLICY IF EXISTS "warehouse_write_off_items_all" ON warehouse_write_off_items;
DROP POLICY IF EXISTS "warehouse_inventory_sessions_all" ON warehouse_inventory_sessions;
DROP POLICY IF EXISTS "warehouse_inventory_lines_all" ON warehouse_inventory_lines;

CREATE POLICY "warehouse_deliveries_all" ON warehouse_deliveries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "warehouse_delivery_items_all" ON warehouse_delivery_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "warehouse_write_offs_all" ON warehouse_write_offs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "warehouse_write_off_items_all" ON warehouse_write_off_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "warehouse_inventory_sessions_all" ON warehouse_inventory_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "warehouse_inventory_lines_all" ON warehouse_inventory_lines FOR ALL USING (true) WITH CHECK (true);

-- === Floor plan columns (20260430120001_tables_layout_columns.sql) ===

ALTER TABLE tables ADD COLUMN IF NOT EXISTS col_span INTEGER NOT NULL DEFAULT 2;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS row_span INTEGER NOT NULL DEFAULT 2;

-- === Venues for Settings (20260430120002_venues_optional.sql) ===

CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY,
  name TEXT,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO venues (id, name)
VALUES ('00000000-0000-0000-0000-000000000010', 'Точка')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "venues_all" ON venues;
CREATE POLICY "venues_all" ON venues FOR ALL USING (true) WITH CHECK (true);

-- === Warehouse doc fields (20260501120004_warehouse_doc_fields.sql) ===

ALTER TABLE warehouse_deliveries
  ADD COLUMN IF NOT EXISTS comment TEXT NOT NULL DEFAULT '';

ALTER TABLE warehouse_deliveries
  ALTER COLUMN delivery_date TYPE TIMESTAMPTZ USING delivery_date::timestamptz;

ALTER TABLE warehouse_write_offs
  ADD COLUMN IF NOT EXISTS comment TEXT NOT NULL DEFAULT '';

ALTER TABLE warehouse_write_offs
  ALTER COLUMN write_off_date TYPE TIMESTAMPTZ USING write_off_date::timestamptz;
