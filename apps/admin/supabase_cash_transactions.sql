-- cash_transactions table
CREATE TABLE IF NOT EXISTS cash_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id       UUID NOT NULL,
  shift_id       INTEGER,
  type           TEXT NOT NULL CHECK (type IN ('expense', 'income', 'collection')),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card')),
  amount         NUMERIC(12, 2) NOT NULL,
  note           TEXT,
  transaction_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ct_select" ON cash_transactions FOR SELECT USING (true);
CREATE POLICY "ct_insert" ON cash_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "ct_update" ON cash_transactions FOR UPDATE USING (true);
CREATE POLICY "ct_delete" ON cash_transactions FOR DELETE USING (true);
