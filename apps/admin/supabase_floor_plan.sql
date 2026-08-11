-- Create zones table for floor plan
CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  name TEXT NOT NULL,
  grid_cols INTEGER NOT NULL DEFAULT 8,
  grid_rows INTEGER NOT NULL DEFAULT 5,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create tables table for floor plan
CREATE TABLE IF NOT EXISTS tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 4,
  col INTEGER NOT NULL DEFAULT 0,
  row INTEGER NOT NULL DEFAULT 0,
  size TEXT NOT NULL DEFAULT 'regular', -- small, regular, wide, tall, bar
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;

-- Add policies for zones
CREATE POLICY "Allow all selects on zones" ON zones FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on zones" ON zones FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on zones" ON zones FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on zones" ON zones FOR DELETE USING (true);

-- Add policies for tables
CREATE POLICY "Allow all selects on tables" ON tables FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on tables" ON tables FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on tables" ON tables FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on tables" ON tables FOR DELETE USING (true);

-- Insert default zone for MVP venue
INSERT INTO zones (id, venue_id, name, grid_cols, grid_rows, sort_order)
VALUES (
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000010',
  'Основной зал',
  20,
  15,
  0
) ON CONFLICT (id) DO NOTHING;
