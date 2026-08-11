-- Warehouse admin page permissions:
-- venue-scoped access to warehouses and warehouse_products.

ALTER TABLE IF EXISTS public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warehouse_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warehouses_all" ON public.warehouses;
DROP POLICY IF EXISTS "warehouses_select_test" ON public.warehouses;
DROP POLICY IF EXISTS "warehouses_venue" ON public.warehouses;

CREATE POLICY "warehouses_venue"
ON public.warehouses
FOR ALL
USING (public.user_has_venue_access(venue_id))
WITH CHECK (public.user_has_venue_access(venue_id));

DROP POLICY IF EXISTS "warehouse_products_all" ON public.warehouse_products;
DROP POLICY IF EXISTS "warehouse_products_venue" ON public.warehouse_products;

CREATE POLICY "warehouse_products_venue"
ON public.warehouse_products
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.warehouses w
    WHERE w.id = warehouse_id
      AND public.user_has_venue_access(w.venue_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.warehouses w
    WHERE w.id = warehouse_id
      AND public.user_has_venue_access(w.venue_id)
  )
);
