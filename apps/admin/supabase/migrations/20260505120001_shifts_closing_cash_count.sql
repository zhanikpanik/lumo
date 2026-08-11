-- Physical cash counted at drawer when closing shift; admin UI computes
-- difference vs expected (starting_cash + cash_total).
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS closing_cash_count NUMERIC(14, 2);

COMMENT ON COLUMN public.shifts.closing_cash_count IS 'Cash counted in register at close; разница = closing_cash_count - expected cash in app.';
