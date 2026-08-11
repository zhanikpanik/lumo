-- Prevent duplicate warehouse names per venue
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_venue_name_unique
  ON public.warehouses (venue_id, lower(name));
