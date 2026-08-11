-- Transaction categories for income/expense cash shift transactions.
CREATE TABLE IF NOT EXISTS cash_transaction_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   UUID NOT NULL,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ct_categories_venue ON cash_transaction_categories(venue_id);

ALTER TABLE cash_transaction_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ctc_all" ON cash_transaction_categories;
CREATE POLICY "ctc_all" ON cash_transaction_categories FOR ALL USING (true) WITH CHECK (true);

-- FK from cash_transactions → categories
DO $$
BEGIN
  IF to_regclass('public.cash_transactions') IS NOT NULL THEN
    ALTER TABLE cash_transactions
      ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES cash_transaction_categories(id) ON DELETE SET NULL;
  END IF;
END
$$;