-- Add stock_quantity and unit columns to products table.
-- Hooks (useMenuData) query these columns for ingredient list views.
-- Old warehouse RPCs (apply_delivery_stock etc) also referenced stock_quantity.
-- Added as nullable with defaults so existing data is unaffected.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'кг';

-- Backfill unit for existing ingredients from most common unit
UPDATE public.products
SET unit = 'кг'
WHERE type = 'ingredient' AND unit = 'кг';

-- Backfill stock_quantity from stock_items (sum across all warehouses)
UPDATE public.products p
SET stock_quantity = COALESCE((
  SELECT SUM(si.quantity)
  FROM public.stock_items si
  WHERE si.product_id = p.id
), 0)
WHERE p.type = 'ingredient';
