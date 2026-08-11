ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS opening_note TEXT;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS closing_note TEXT;
