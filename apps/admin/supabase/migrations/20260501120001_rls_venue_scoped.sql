-- Replace wide-open RLS with venue-scoped policies.
-- These use the user_venues join to enforce that the calling user
-- has access to the venue_id on each row.
--
-- Requires: Supabase Auth enabled and user_venues(user_id, venue_id) mapping.
-- If users table stores auth id in different columns, we read it dynamically.
--
-- While VITE_REQUIRE_AUTH=false (local dev), the anon key bypasses auth
-- and these policies still need to pass. We use a helper function that
-- returns true for anon (no auth.uid) or checks the venue membership.

CREATE OR REPLACE FUNCTION public.user_has_venue_access(target_venue UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() IS NULL THEN true  -- anon key in dev
      ELSE EXISTS (
        SELECT 1
        FROM user_venues uv
        LEFT JOIN users u ON u.id = uv.user_id
        WHERE uv.venue_id = target_venue
          AND (
            uv.user_id::text = auth.uid()::text
            OR COALESCE(to_jsonb(u)->>'auth_user_id', '') = auth.uid()::text
            OR COALESCE(to_jsonb(u)->>'auth_id', '') = auth.uid()::text
            OR COALESCE(to_jsonb(u)->>'supabase_auth_id', '') = auth.uid()::text
          )
      )
    END;
$$;

-- Warehouse deliveries
DROP POLICY IF EXISTS "warehouse_deliveries_all" ON warehouse_deliveries;
DROP POLICY IF EXISTS "warehouse_deliveries_venue" ON warehouse_deliveries;
CREATE POLICY "warehouse_deliveries_venue" ON warehouse_deliveries
  FOR ALL USING (public.user_has_venue_access(venue_id))
  WITH CHECK (public.user_has_venue_access(venue_id));

DROP POLICY IF EXISTS "warehouse_delivery_items_all" ON warehouse_delivery_items;
DROP POLICY IF EXISTS "warehouse_delivery_items_venue" ON warehouse_delivery_items;
CREATE POLICY "warehouse_delivery_items_venue" ON warehouse_delivery_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM warehouse_deliveries wd WHERE wd.id = delivery_id AND public.user_has_venue_access(wd.venue_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM warehouse_deliveries wd WHERE wd.id = delivery_id AND public.user_has_venue_access(wd.venue_id))
  );

-- Warehouse write-offs
DROP POLICY IF EXISTS "warehouse_write_offs_all" ON warehouse_write_offs;
DROP POLICY IF EXISTS "warehouse_write_offs_venue" ON warehouse_write_offs;
CREATE POLICY "warehouse_write_offs_venue" ON warehouse_write_offs
  FOR ALL USING (public.user_has_venue_access(venue_id))
  WITH CHECK (public.user_has_venue_access(venue_id));

DROP POLICY IF EXISTS "warehouse_write_off_items_all" ON warehouse_write_off_items;
DROP POLICY IF EXISTS "warehouse_write_off_items_venue" ON warehouse_write_off_items;
CREATE POLICY "warehouse_write_off_items_venue" ON warehouse_write_off_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM warehouse_write_offs wo WHERE wo.id = write_off_id AND public.user_has_venue_access(wo.venue_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM warehouse_write_offs wo WHERE wo.id = write_off_id AND public.user_has_venue_access(wo.venue_id))
  );

-- Warehouse inventory
DROP POLICY IF EXISTS "warehouse_inventory_sessions_all" ON warehouse_inventory_sessions;
DROP POLICY IF EXISTS "warehouse_inventory_sessions_venue" ON warehouse_inventory_sessions;
CREATE POLICY "warehouse_inventory_sessions_venue" ON warehouse_inventory_sessions
  FOR ALL USING (public.user_has_venue_access(venue_id))
  WITH CHECK (public.user_has_venue_access(venue_id));

DROP POLICY IF EXISTS "warehouse_inventory_lines_all" ON warehouse_inventory_lines;
DROP POLICY IF EXISTS "warehouse_inventory_lines_venue" ON warehouse_inventory_lines;
CREATE POLICY "warehouse_inventory_lines_venue" ON warehouse_inventory_lines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM warehouse_inventory_sessions s WHERE s.id = session_id AND public.user_has_venue_access(s.venue_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM warehouse_inventory_sessions s WHERE s.id = session_id AND public.user_has_venue_access(s.venue_id))
  );

-- Venues
DROP POLICY IF EXISTS "venues_all" ON venues;
DROP POLICY IF EXISTS "venues_venue" ON venues;
CREATE POLICY "venues_venue" ON venues
  FOR ALL USING (public.user_has_venue_access(id))
  WITH CHECK (public.user_has_venue_access(id));
