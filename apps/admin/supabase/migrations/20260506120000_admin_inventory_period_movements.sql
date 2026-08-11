-- Admin inventory counting: period aggregates for movement columns.
-- Consumption: inventory_ledger (written by POS finalize_order_consumption or compatible).
-- Incoming / write-offs / transfers: warehouse documents (same venue DB).
--
-- If POS already created inventory_ledger with different columns, alter this RPC
-- or align table DDL before applying.

CREATE TABLE IF NOT EXISTS public.inventory_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric(14, 4) NOT NULL,
  movement_type text NOT NULL,
  ref_id uuid,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_ledger_venue_ws_time
  ON public.inventory_ledger(venue_id, workshop_id, created_at);

ALTER TABLE public.inventory_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_ledger_venue" ON public.inventory_ledger;
CREATE POLICY "inventory_ledger_venue" ON public.inventory_ledger
  FOR ALL USING (public.user_has_venue_access(venue_id))
  WITH CHECK (public.user_has_venue_access(venue_id));

DROP FUNCTION IF EXISTS public.admin_inventory_period_movements(uuid, uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.admin_inventory_period_movements(
  p_venue_id uuid,
  p_workshop_id uuid,
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
  WITH cons AS (
    SELECT il.product_id,
           COALESCE(SUM(il.quantity), 0)::numeric AS qty
    FROM public.inventory_ledger il
    WHERE il.venue_id = p_venue_id
      AND il.workshop_id = p_workshop_id
      AND il.created_at >= p_from
      AND il.created_at < p_to
      AND il.movement_type IN (
        'sale',
        'order_consumption',
        'consumption',
        'finalize_order'
      )
    GROUP BY il.product_id
  ),
  deliv AS (
    SELECT di.product_id,
           COALESCE(SUM(di.quantity), 0)::numeric AS qty
    FROM public.warehouse_delivery_items di
    JOIN public.warehouse_deliveries d ON d.id = di.delivery_id
    WHERE d.venue_id = p_venue_id
      AND d.workshop_id = p_workshop_id
      AND d.status = 'received'
      AND d.delivery_date >= p_from
      AND d.delivery_date < p_to
      AND di.product_id IS NOT NULL
    GROUP BY di.product_id
  ),
  woff AS (
    SELECT wi.product_id,
           COALESCE(SUM(wi.quantity), 0)::numeric AS qty
    FROM public.warehouse_write_off_items wi
    JOIN public.warehouse_write_offs w ON w.id = wi.write_off_id
    WHERE w.venue_id = p_venue_id
      AND w.workshop_id = p_workshop_id
      AND w.status = 'posted'
      AND w.write_off_date >= p_from
      AND w.write_off_date < p_to
      AND wi.product_id IS NOT NULL
    GROUP BY wi.product_id
  ),
  xfer AS (
    SELECT x.product_id,
           COALESCE(SUM(x.signed_qty), 0)::numeric AS net
    FROM (
      SELECT ti.dest_product_id AS product_id,
             ti.quantity AS signed_qty
      FROM public.warehouse_transfer_items ti
      JOIN public.warehouse_transfers t ON t.id = ti.transfer_id
      WHERE t.venue_id = p_venue_id
        AND t.status = 'posted'
        AND t.to_workshop_id = p_workshop_id
        AND t.transfer_date >= p_from
        AND t.transfer_date < p_to
        AND ti.dest_product_id IS NOT NULL

      UNION ALL

      SELECT ti.product_id AS product_id,
             -ti.quantity AS signed_qty
      FROM public.warehouse_transfer_items ti
      JOIN public.warehouse_transfers t ON t.id = ti.transfer_id
      WHERE t.venue_id = p_venue_id
        AND t.status = 'posted'
        AND t.from_workshop_id = p_workshop_id
        AND t.transfer_date >= p_from
        AND t.transfer_date < p_to
        AND ti.product_id IS NOT NULL
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
