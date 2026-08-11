-- Phase A: Consumption calculation from sales (order_items × recipe_items).
-- Fixes: 
--   1. Parameter name mismatch (frontend sends p_warehouse_id, old func had p_workshop_id → NULL → all zeros)
--   2. Replaces deprecated inventory_ledger with real sales-based consumption
--   3. Updates delivery/writeoff/transfer CTEs to filter by warehouse_id via workshops join

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
AS $$
  -- Consumption: order_items × recipe_items for paid orders in period
  -- filtered to dishes whose workshop maps to p_warehouse_id
  WITH cons AS (
    SELECT ri.ingredient_id AS product_id,
           COALESCE(SUM(ri.quantity * oi.quantity), 0)::numeric AS qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.recipe_items ri ON ri.product_id = oi.product_id
    JOIN public.products dish ON dish.id = oi.product_id
    JOIN public.workshops w ON w.id = dish.workshop_id
    WHERE o.venue_id = p_venue_id
      AND o.status = 'paid'
      AND o.opened_at >= p_from
      AND o.opened_at < p_to
      AND w.default_warehouse_id = p_warehouse_id
    GROUP BY ri.ingredient_id
  ),
  -- Incoming deliveries: received deliveries whose workshop maps to this warehouse
  deliv AS (
    SELECT di.product_id,
           COALESCE(SUM(di.quantity), 0)::numeric AS qty
    FROM public.warehouse_delivery_items di
    JOIN public.warehouse_deliveries d ON d.id = di.delivery_id
    JOIN public.workshops w ON w.id = d.workshop_id
    WHERE d.venue_id = p_venue_id
      AND d.status = 'received'
      AND d.delivery_date >= p_from
      AND d.delivery_date < p_to
      AND di.product_id IS NOT NULL
      AND w.default_warehouse_id = p_warehouse_id
    GROUP BY di.product_id
  ),
  -- Write-offs: posted write-offs whose workshop maps to this warehouse
  woff AS (
    SELECT wi.product_id,
           COALESCE(SUM(wi.quantity), 0)::numeric AS qty
    FROM public.warehouse_write_off_items wi
    JOIN public.warehouse_write_offs w ON w.id = wi.write_off_id
    JOIN public.workshops wk ON wk.id = w.workshop_id
    WHERE w.venue_id = p_venue_id
      AND w.status = 'posted'
      AND w.write_off_date >= p_from
      AND w.write_off_date < p_to
      AND wi.product_id IS NOT NULL
      AND wk.default_warehouse_id = p_warehouse_id
    GROUP BY wi.product_id
  ),
  -- Transfers: net movement (in - out) for transfers posted in period
  xfer AS (
    SELECT x.product_id,
           COALESCE(SUM(x.signed_qty), 0)::numeric AS net
    FROM (
      -- Incoming transfers: destination workshop maps to this warehouse
      SELECT ti.dest_product_id AS product_id,
             ti.quantity AS signed_qty
      FROM public.warehouse_transfer_items ti
      JOIN public.warehouse_transfers t ON t.id = ti.transfer_id
      JOIN public.workshops w ON w.id = t.to_workshop_id
      WHERE t.venue_id = p_venue_id
        AND t.status = 'posted'
        AND t.transfer_date >= p_from
        AND t.transfer_date < p_to
        AND ti.dest_product_id IS NOT NULL
        AND w.default_warehouse_id = p_warehouse_id

      UNION ALL

      -- Outgoing transfers: source workshop maps to this warehouse
      SELECT ti.product_id AS product_id,
             -ti.quantity AS signed_qty
      FROM public.warehouse_transfer_items ti
      JOIN public.warehouse_transfers t ON t.id = ti.transfer_id
      JOIN public.workshops w ON w.id = t.from_workshop_id
      WHERE t.venue_id = p_venue_id
        AND t.status = 'posted'
        AND t.transfer_date >= p_from
        AND t.transfer_date < p_to
        AND ti.product_id IS NOT NULL
        AND w.default_warehouse_id = p_warehouse_id
    ) x
    GROUP BY x.product_id
  ),
  all_p AS (
    SELECT cons.product_id FROM cons
    UNION SELECT deliv.product_id FROM deliv
    UNION SELECT woff.product_id FROM woff
    UNION SELECT xfer.product_id FROM xfer
  )
  SELECT ap.product_id,
         COALESCE(c.qty, 0)::numeric AS consumption,
         COALESCE(d.qty, 0)::numeric AS incoming_delivery,
         COALESCE(w.qty, 0)::numeric AS writeoff_qty,
         COALESCE(x.net, 0)::numeric AS transfer_net
  FROM all_p ap
  LEFT JOIN cons c ON c.product_id = ap.product_id
  LEFT JOIN deliv d ON d.product_id = ap.product_id
  LEFT JOIN woff w ON w.product_id = ap.product_id
  LEFT JOIN xfer x ON x.product_id = ap.product_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_inventory_period_movements(uuid, uuid, timestamptz, timestamptz)
  TO anon, authenticated;
