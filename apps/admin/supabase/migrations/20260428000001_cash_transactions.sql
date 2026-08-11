-- Fix shift_id column type from INTEGER to UUID to match shifts.id.
-- Guarded so fresh environments without this table do not fail.
DO $$
BEGIN
  IF to_regclass('public.cash_transactions') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cash_transactions'
      AND column_name = 'shift_id'
      AND udt_name <> 'uuid'
  ) THEN
    ALTER TABLE public.cash_transactions
      ALTER COLUMN shift_id TYPE uuid USING NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'cash_transactions_shift_id_fkey'
      AND c.conrelid = 'public.cash_transactions'::regclass
  ) THEN
    ALTER TABLE public.cash_transactions
      ADD CONSTRAINT cash_transactions_shift_id_fkey
      FOREIGN KEY (shift_id) REFERENCES shifts(id)
      NOT VALID;
  END IF;
END
$$;
