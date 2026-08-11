-- Allow venue-scoped read/write on stock_items through warehouse ownership.

ALTER TABLE IF EXISTS public.stock_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_items_all" ON public.stock_items;
DROP POLICY IF EXISTS "stock_items_venue" ON public.stock_items;

CREATE POLICY "stock_items_venue"
ON public.stock_items
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.warehouses w
    WHERE w.id = stock_items.warehouse_id
      AND public.user_has_venue_access(w.venue_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.warehouses w
    WHERE w.id = stock_items.warehouse_id
      AND public.user_has_venue_access(w.venue_id)
  )
);
