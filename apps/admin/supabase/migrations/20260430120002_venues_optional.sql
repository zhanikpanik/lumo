-- Optional venue profile for Settings page (safe if table already exists from POS)
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY,
  name TEXT,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO venues (id, organization_id, name)
VALUES ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Точка')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "venues_all" ON venues;
CREATE POLICY "venues_all" ON venues FOR ALL USING (true) WITH CHECK (true);
