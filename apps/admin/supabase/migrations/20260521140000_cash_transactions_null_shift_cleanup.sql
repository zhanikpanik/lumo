-- Orphan rows (shift_id NULL) break shift-level journal and differ from POS RPC contract.
-- Remove them, then require shift_id so only shift-bound rows can exist.

DELETE FROM public.cash_transactions
WHERE shift_id IS NULL;

ALTER TABLE public.cash_transactions
  ALTER COLUMN shift_id SET NOT NULL;
