-- Glovo inbound hardening: restrict marketplace_* tables to service_role only.
-- The edge function ('glovo-inbound') runs with the service role and bypasses RLS,
-- so dropping all permissive policies prevents anon/authenticated clients from
-- reading store bindings or raw webhook payloads while keeping ingestion working.

DROP POLICY IF EXISTS "Allow all reads"   ON marketplace_store_bindings;
DROP POLICY IF EXISTS "Allow all inserts" ON marketplace_store_bindings;
DROP POLICY IF EXISTS "Allow all updates" ON marketplace_store_bindings;
DROP POLICY IF EXISTS "Allow all deletes" ON marketplace_store_bindings;

DROP POLICY IF EXISTS "Allow all reads"   ON marketplace_inbound_events;
DROP POLICY IF EXISTS "Allow all inserts" ON marketplace_inbound_events;
DROP POLICY IF EXISTS "Allow all updates" ON marketplace_inbound_events;
DROP POLICY IF EXISTS "Allow all deletes" ON marketplace_inbound_events;

ALTER TABLE marketplace_store_bindings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_inbound_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_store_bindings  FORCE ROW LEVEL SECURITY;
ALTER TABLE marketplace_inbound_events  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON marketplace_store_bindings  FROM anon, authenticated;
REVOKE ALL ON marketplace_inbound_events  FROM anon, authenticated;
