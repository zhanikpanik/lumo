-- P0: shift cash ledger with server-side expected/difference

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'cash_movement_type'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE cash_movement_type AS ENUM ('sale', 'refund', 'collection', 'float_in', 'float_out');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  movement_type cash_movement_type NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_shift_occurred
  ON cash_movements (shift_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_movements_venue_shift
  ON cash_movements (venue_id, shift_id);
CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_payment_type_uidx
  ON cash_movements (payment_id, movement_type)
  WHERE payment_id IS NOT NULL;

ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all reads" ON cash_movements;
DROP POLICY IF EXISTS "Allow all inserts" ON cash_movements;
DROP POLICY IF EXISTS "Allow all updates" ON cash_movements;
DROP POLICY IF EXISTS "Allow all deletes" ON cash_movements;
CREATE POLICY "Allow all reads" ON cash_movements FOR SELECT USING (true);
CREATE POLICY "Allow all inserts" ON cash_movements FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates" ON cash_movements FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes" ON cash_movements FOR DELETE USING (true);

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS expected_cash_at_close numeric(10,2),
  ADD COLUMN IF NOT EXISTS cash_difference_at_close numeric(10,2),
  ADD COLUMN IF NOT EXISTS cash_collections_total numeric(10,2) NOT NULL DEFAULT 0;

-- Backfill sale/refund ledger rows from existing payments.
INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, payment_id, order_id, occurred_at, note)
SELECT
  p.venue_id,
  p.shift_id,
  'sale'::cash_movement_type,
  p.amount,
  p.id,
  p.order_id,
  COALESCE(p.created_at, now()),
  'backfill_from_payments'
FROM payments p
WHERE p.method = 'cash'
  AND p.shift_id IS NOT NULL
  AND p.refunded_at IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, payment_id, order_id, occurred_at, note)
SELECT
  p.venue_id,
  p.shift_id,
  'refund'::cash_movement_type,
  p.amount,
  p.id,
  p.order_id,
  p.refunded_at,
  'backfill_refund_from_payments'
FROM payments p
WHERE p.method = 'cash'
  AND p.shift_id IS NOT NULL
  AND p.refunded_at IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION sync_cash_movements_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.method = 'cash' AND NEW.shift_id IS NOT NULL AND NEW.refunded_at IS NULL THEN
      INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, payment_id, order_id, occurred_at, note)
      VALUES (
        NEW.venue_id,
        NEW.shift_id,
        'sale',
        NEW.amount,
        NEW.id,
        NEW.order_id,
        COALESCE(NEW.created_at, now()),
        'payment_insert'
      )
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.method = 'cash'
      AND NEW.shift_id IS NOT NULL
      AND OLD.refunded_at IS NULL
      AND NEW.refunded_at IS NOT NULL
    THEN
      INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, payment_id, order_id, occurred_at, note)
      VALUES (
        NEW.venue_id,
        NEW.shift_id,
        'refund',
        NEW.amount,
        NEW.id,
        NEW.order_id,
        NEW.refunded_at,
        'payment_refund'
      )
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cash_movements_from_payments ON payments;
CREATE TRIGGER trg_sync_cash_movements_from_payments
AFTER INSERT OR UPDATE OF refunded_at ON payments
FOR EACH ROW
EXECUTE FUNCTION sync_cash_movements_from_payments();

CREATE OR REPLACE FUNCTION pos_shift_cash_summary(
  p_venue_id uuid,
  p_shift_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access_allowed boolean;
  v_role text;
  v_starting_cash numeric(10,2);
  v_closed_at timestamptz;
  v_sale numeric(10,2) := 0;
  v_refund numeric(10,2) := 0;
  v_collection numeric(10,2) := 0;
  v_float_in numeric(10,2) := 0;
  v_float_out numeric(10,2) := 0;
  v_expected numeric(10,2);
BEGIN
  v_role := auth.role();
  IF v_role IN ('service_role', 'anon') THEN
    v_access_allowed := true;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM user_venues uv
      WHERE uv.user_id = auth.uid()
        AND uv.venue_id = p_venue_id
    ) INTO v_access_allowed;
  ELSE
    v_access_allowed := false;
  END IF;

  IF NOT COALESCE(v_access_allowed, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'forbidden',
      'detail', jsonb_build_object('venue_id', p_venue_id)
    );
  END IF;

  SELECT s.starting_cash, s.closed_at
  INTO v_starting_cash, v_closed_at
  FROM shifts s
  WHERE s.id = p_shift_id
    AND s.venue_id = p_venue_id;

  IF v_starting_cash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shift_not_found');
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN cm.movement_type = 'sale' THEN cm.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cm.movement_type = 'refund' THEN cm.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cm.movement_type = 'collection' THEN cm.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cm.movement_type = 'float_in' THEN cm.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cm.movement_type = 'float_out' THEN cm.amount ELSE 0 END), 0)
  INTO v_sale, v_refund, v_collection, v_float_in, v_float_out
  FROM cash_movements cm
  WHERE cm.venue_id = p_venue_id
    AND cm.shift_id = p_shift_id;

  v_expected :=
    COALESCE(v_starting_cash, 0)
    + v_sale
    + v_float_in
    - v_refund
    - v_collection
    - v_float_out;

  RETURN jsonb_build_object(
    'ok', true,
    'shift_id', p_shift_id,
    'is_closed', v_closed_at IS NOT NULL,
    'starting_cash', COALESCE(v_starting_cash, 0),
    'cash_sales', COALESCE(v_sale, 0),
    'cash_refunds', COALESCE(v_refund, 0),
    'cash_collections', COALESCE(v_collection, 0),
    'cash_float_in', COALESCE(v_float_in, 0),
    'cash_float_out', COALESCE(v_float_out, 0),
    'expected_cash', COALESCE(v_expected, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION pos_record_cash_collection(
  p_venue_id uuid,
  p_shift_id uuid,
  p_amount numeric(10,2),
  p_note text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift_exists boolean;
  v_shift_closed boolean;
  v_summary jsonb;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM shifts s
    WHERE s.id = p_shift_id
      AND s.venue_id = p_venue_id
  )
  INTO v_shift_exists;

  IF NOT v_shift_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shift_not_found');
  END IF;

  SELECT (s.closed_at IS NOT NULL)
  INTO v_shift_closed
  FROM shifts s
  WHERE s.id = p_shift_id
    AND s.venue_id = p_venue_id;

  IF v_shift_closed THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shift_already_closed');
  END IF;

  INSERT INTO cash_movements (
    venue_id,
    shift_id,
    movement_type,
    amount,
    note,
    occurred_at
  ) VALUES (
    p_venue_id,
    p_shift_id,
    'collection',
    p_amount,
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    COALESCE(p_occurred_at, now())
  );

  UPDATE shifts
  SET cash_collections_total = COALESCE(cash_collections_total, 0) + p_amount
  WHERE id = p_shift_id
    AND venue_id = p_venue_id;

  SELECT pos_shift_cash_summary(p_venue_id, p_shift_id) INTO v_summary;
  RETURN v_summary;
END;
$$;

CREATE OR REPLACE FUNCTION pos_close_shift(
  p_venue_id uuid,
  p_shift_id uuid,
  p_counted_cash numeric(10,2),
  p_closed_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_summary jsonb;
  v_expected numeric(10,2);
  v_difference numeric(10,2);
  v_total_orders int;
  v_total_revenue numeric(10,2);
  v_cash_total numeric(10,2);
  v_card_total numeric(10,2);
  v_other_total numeric(10,2);
BEGIN
  IF p_counted_cash IS NULL OR p_counted_cash < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_counted_cash');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM shifts s
    WHERE s.id = p_shift_id
      AND s.venue_id = p_venue_id
      AND s.closed_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shift_not_open');
  END IF;

  SELECT pos_shift_cash_summary(p_venue_id, p_shift_id) INTO v_summary;
  IF COALESCE((v_summary->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_summary;
  END IF;

  v_expected := COALESCE((v_summary->>'expected_cash')::numeric, 0);
  v_difference := p_counted_cash - v_expected;

  SELECT
    COALESCE(COUNT(*) FILTER (
      WHERE p.method IN ('cash', 'card', 'qr', 'other')
        AND p.refunded_at IS NULL
    ), 0)::int,
    COALESCE(SUM(p.amount) FILTER (
      WHERE p.method IN ('cash', 'card', 'qr', 'other')
        AND p.refunded_at IS NULL
    ), 0),
    COALESCE(SUM(p.amount) FILTER (
      WHERE p.method = 'cash'
        AND p.refunded_at IS NULL
    ), 0),
    COALESCE(SUM(p.amount) FILTER (
      WHERE p.method IN ('card', 'qr')
        AND p.refunded_at IS NULL
    ), 0),
    COALESCE(SUM(p.amount) FILTER (
      WHERE p.method = 'other'
        AND p.refunded_at IS NULL
    ), 0)
  INTO v_total_orders, v_total_revenue, v_cash_total, v_card_total, v_other_total
  FROM payments p
  WHERE p.shift_id = p_shift_id
    AND p.venue_id = p_venue_id;

  UPDATE shifts
  SET
    closed_at = COALESCE(p_closed_at, now()),
    counted_cash = p_counted_cash,
    expected_cash_at_close = v_expected,
    cash_difference_at_close = v_difference,
    total_orders = v_total_orders,
    total_revenue = v_total_revenue,
    cash_total = v_cash_total,
    card_total = v_card_total,
    other_total = v_other_total
  WHERE id = p_shift_id
    AND venue_id = p_venue_id;

  RETURN jsonb_build_object(
    'ok', true,
    'shift_id', p_shift_id,
    'expected_cash', v_expected,
    'counted_cash', p_counted_cash,
    'difference', v_difference,
    'total_orders', v_total_orders,
    'total_revenue', v_total_revenue,
    'cash_total', v_cash_total,
    'card_total', v_card_total,
    'other_total', v_other_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pos_shift_cash_summary(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION pos_shift_cash_summary(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_shift_cash_summary(uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION pos_record_cash_collection(uuid, uuid, numeric, text, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION pos_record_cash_collection(uuid, uuid, numeric, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_record_cash_collection(uuid, uuid, numeric, text, timestamptz) TO service_role;

GRANT EXECUTE ON FUNCTION pos_close_shift(uuid, uuid, numeric, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION pos_close_shift(uuid, uuid, numeric, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_close_shift(uuid, uuid, numeric, timestamptz) TO service_role;
