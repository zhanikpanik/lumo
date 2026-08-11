-- Procurement checklist: staff creates purchase requests for their assigned warehouses.
-- Manager sees these in admin panel and can convert to warehouse_deliveries.

-- 1) Suppliers — full entity replacing the text field in warehouse_deliveries
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  contact_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(venue_id, name)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_venue ON suppliers(venue_id);

-- 2) Product ↔ Supplier link (many-to-many)
CREATE TABLE IF NOT EXISTS product_suppliers (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_product_suppliers_supplier ON product_suppliers(supplier_id);

-- 3) User ↔ Warehouse assignments (replaces old user_sections concept)
-- Users are from auth.users (Supabase Auth), same as admin panel
CREATE TABLE IF NOT EXISTS user_warehouses (
  user_id UUID NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  can_send_orders BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, warehouse_id)
);

-- Note: No FK to auth.users because auth schema is separate.
-- Add the FK if you use a custom public.users table referencing auth.users.
-- For now, validation happens at application level.

CREATE INDEX IF NOT EXISTS idx_user_warehouses_user ON user_warehouses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_warehouses_warehouse ON user_warehouses(warehouse_id);

-- 4) Procurement checklists (staff purchase requests)
CREATE TABLE IF NOT EXISTS procurement_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procurement_checklists_venue ON procurement_checklists(venue_id);
CREATE INDEX IF NOT EXISTS idx_procurement_checklists_warehouse ON procurement_checklists(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_procurement_checklists_created_by ON procurement_checklists(created_by);
CREATE INDEX IF NOT EXISTS idx_procurement_checklists_status ON procurement_checklists(venue_id, status);

-- 5) Checklist items (products with requested quantity)
CREATE TABLE IF NOT EXISTS procurement_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES procurement_checklists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity NUMERIC(10, 3) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'шт',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(checklist_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_procurement_checklist_items_checklist ON procurement_checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_procurement_checklist_items_product ON procurement_checklist_items(product_id);

-- 6) RLS — all authenticated users can access these tables
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_checklist_items ENABLE ROW LEVEL SECURITY;

-- Per-table policies (permissive for MVP, tighten later)
CREATE POLICY "suppliers_all" ON suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_suppliers_all" ON product_suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "user_warehouses_all" ON user_warehouses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "procurement_checklists_all" ON procurement_checklists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "procurement_checklist_items_all" ON procurement_checklist_items FOR ALL USING (true) WITH CHECK (true);
