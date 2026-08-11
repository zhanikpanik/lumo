-- Add daily_labor_cost to venues for Prime Cost calculation on dashboard.
-- Manager sets default daily labor spend; can override per-day on dashboard.

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS daily_labor_cost numeric(10,2) DEFAULT 0;
