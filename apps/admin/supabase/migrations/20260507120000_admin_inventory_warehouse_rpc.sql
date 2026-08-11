-- Align admin period aggregates with POS: inventory_movements (+ warehouse_id).
-- Documents (deliveries/write-offs/transfers) still use workshop_id on headers;
-- they are scoped via workshop_warehouses for the given warehouse.
--
-- NOTE: This early version is replaced by a later migration (phase_a_consumption_from_sales)
-- which drops and recreates this function with real sales-based consumption.
-- Skipped if warehouse_id column doesn't exist on warehouse tables yet.

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'warehouse_deliveries'
      AND column_name = 'warehouse_id'
  ) THEN
    DROP FUNCTION IF EXISTS public.admin_inventory_period_movements(uuid, uuid, timestamptz, timestamptz);

    CREATE OR REPLACE FUNCTION public.admin_inventory_period_movements(
      p_venue_id uuid,
      p_warehouse_id uuid,
      p_from timestamptz,
      p_to timestamptz
    )
    RETURNS TABLE (
      product_id uuid,
      consumption numeric,
      incoming_delivery numeric,
      writeoff_qty numeric,
      transfer_net numeric
    )
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = public
    AS $func$
      SELECT NULL::uuid, 0::numeric, 0::numeric, 0::numeric, 0::numeric WHERE false;
    $func$;

    GRANT EXECUTE ON FUNCTION public.admin_inventory_period_movements(uuid, uuid, timestamptz, timestamptz)
      TO anon, authenticated;
  END IF;
END
$guard$;
