-- Glovo Inbound Phase 1
-- Minimal schema for inbound webhook ingestion + idempotent order identity.

CREATE TABLE IF NOT EXISTS marketplace_store_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('glovo')),
  external_store_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_store_id),
  UNIQUE (venue_id, provider)
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'pos',
  ADD COLUMN IF NOT EXISTS external_order_id text,
  ADD COLUMN IF NOT EXISTS integration_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS orders_venue_source_external_uidx
  ON orders (venue_id, order_source, external_order_id)
  WHERE external_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS marketplace_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('glovo')),
  external_event_id text,
  event_type text NOT NULL,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  external_order_id text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text,
  linked_order_id uuid REFERENCES orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_marketplace_inbound_events_provider_received
  ON marketplace_inbound_events(provider, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_inbound_events_venue
  ON marketplace_inbound_events(venue_id, received_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_inbound_events_provider_external_uidx
  ON marketplace_inbound_events(provider, external_event_id)
  WHERE external_event_id IS NOT NULL;

ALTER TABLE marketplace_store_bindings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all reads" ON marketplace_store_bindings;
DROP POLICY IF EXISTS "Allow all inserts" ON marketplace_store_bindings;
DROP POLICY IF EXISTS "Allow all updates" ON marketplace_store_bindings;
DROP POLICY IF EXISTS "Allow all deletes" ON marketplace_store_bindings;
CREATE POLICY "Allow all reads" ON marketplace_store_bindings FOR SELECT USING (true);
CREATE POLICY "Allow all inserts" ON marketplace_store_bindings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates" ON marketplace_store_bindings FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes" ON marketplace_store_bindings FOR DELETE USING (true);

ALTER TABLE marketplace_inbound_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all reads" ON marketplace_inbound_events;
DROP POLICY IF EXISTS "Allow all inserts" ON marketplace_inbound_events;
DROP POLICY IF EXISTS "Allow all updates" ON marketplace_inbound_events;
DROP POLICY IF EXISTS "Allow all deletes" ON marketplace_inbound_events;
CREATE POLICY "Allow all reads" ON marketplace_inbound_events FOR SELECT USING (true);
CREATE POLICY "Allow all inserts" ON marketplace_inbound_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates" ON marketplace_inbound_events FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes" ON marketplace_inbound_events FOR DELETE USING (true);
