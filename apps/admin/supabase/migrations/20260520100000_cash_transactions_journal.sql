-- Journal rows in public.cash_transactions for admin /cash-shifts and /transactions.
-- POS already wrote cash_movements; admin expects cash_transactions (type income,
-- payment_method cash, etc.). Mirror float in/out and collection here.

CREATE TABLE IF NOT EXISTS public.cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  type text NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash',
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  transaction_at timestamptz NOT NULL DEFAULT now(),
  note text,
  category_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_venue_at
  ON public.cash_transactions (venue_id, transaction_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_shift_at
  ON public.cash_transactions (shift_id, transaction_at DESC);

ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all reads" ON public.cash_transactions;
DROP POLICY IF EXISTS "Allow all inserts" ON public.cash_transactions;
DROP POLICY IF EXISTS "Allow all updates" ON public.cash_transactions;
DROP POLICY IF EXISTS "Allow all deletes" ON public.cash_transactions;

CREATE POLICY "Allow all reads" ON public.cash_transactions FOR SELECT USING (true);
CREATE POLICY "Allow all inserts" ON public.cash_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates" ON public.cash_transactions FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes" ON public.cash_transactions FOR DELETE USING (true);

-- Reads for admin / PostgREST; writes go through SECURITY DEFINER RPCs.
GRANT SELECT ON public.cash_transactions TO anon, authenticated, service_role;

-- Float in (внесение) / float out: keep cash_movements + append cash_transactions.
CREATE OR REPLACE FUNCTION pos_record_cash_transaction(
  p_venue_id uuid,
  p_shift_id uuid,
  p_kind text,
  p_amount numeric(10,2),
  p_note text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_access_allowed boolean;
  v_actor_role user_role;
  v_movement_type cash_movement_type;
  v_starting_cash numeric(10,2);
  v_shift_closed_at timestamptz;
  v_opened_at timestamptz;
  v_tx_at timestamptz := COALESCE(p_occurred_at, now());
  v_delta numeric(10,2);
  v_available numeric(10,2);
  v_summary jsonb;
  v_journal_type text;
BEGIN
  v_role := auth.role();
  IF v_role IN ('service_role', 'anon') THEN
    v_access_allowed := true;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.user_id = auth.uid() AND uv.venue_id = p_venue_id
    ) INTO v_access_allowed;
  ELSE
    v_access_allowed := false;
  END IF;

  IF NOT COALESCE(v_access_allowed, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_actor_user_id IS NOT NULL THEN
    SELECT u.role
    INTO v_actor_role
    FROM users u
    JOIN user_venues uv
      ON uv.user_id = u.id AND uv.venue_id = p_venue_id
    WHERE u.id = p_actor_user_id
    LIMIT 1;

    IF v_actor_role IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'actor_not_allowed');
    END IF;

    IF v_actor_role = 'waiter' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'actor_forbidden_role');
    END IF;
  END IF;

  IF p_kind = 'in' THEN
    v_movement_type := 'float_in';
    v_journal_type := 'income';
  ELSIF p_kind = 'out' THEN
    v_movement_type := 'float_out';
    v_journal_type := 'expense';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  SELECT s.starting_cash, s.closed_at, s.opened_at
  INTO v_starting_cash, v_shift_closed_at, v_opened_at
  FROM shifts s
  WHERE s.id = p_shift_id
    AND s.venue_id = p_venue_id;

  IF v_starting_cash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shift_not_found');
  END IF;

  IF v_shift_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shift_not_open');
  END IF;

  IF v_opened_at IS NOT NULL AND v_tx_at < v_opened_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transaction_time');
  END IF;

  IF v_movement_type = 'float_out' THEN
    SELECT COALESCE(SUM(
      CASE WHEN cm.movement_type IN ('sale', 'float_in') THEN cm.amount
           ELSE -cm.amount
      END
    ), 0)
    INTO v_delta
    FROM cash_movements cm
    WHERE cm.shift_id = p_shift_id
      AND cm.venue_id = p_venue_id;

    v_available := COALESCE(v_starting_cash, 0) + COALESCE(v_delta, 0);

    IF v_available - p_amount < 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'insufficient_cash',
        'detail', jsonb_build_object(
          'available', v_available,
          'requested', p_amount
        )
      );
    END IF;
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
    v_movement_type,
    p_amount,
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    v_tx_at
  );

  INSERT INTO public.cash_transactions (
    venue_id,
    shift_id,
    type,
    payment_method,
    amount,
    transaction_at,
    note
  ) VALUES (
    p_venue_id,
    p_shift_id,
    v_journal_type,
    'cash',
    p_amount,
    v_tx_at,
    NULLIF(btrim(COALESCE(p_note, '')), '')
  );

  SELECT pos_shift_cash_summary(p_venue_id, p_shift_id) INTO v_summary;
  RETURN v_summary;
END;
$$;

-- Инкассация: same journal row for admin cash ledger.
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
  v_tx_at timestamptz := COALESCE(p_occurred_at, now());
  v_opened_at timestamptz;
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

  SELECT (s.closed_at IS NOT NULL), s.opened_at
  INTO v_shift_closed, v_opened_at
  FROM shifts s
  WHERE s.id = p_shift_id
    AND s.venue_id = p_venue_id;

  IF v_shift_closed THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shift_already_closed');
  END IF;

  IF v_opened_at IS NOT NULL AND v_tx_at < v_opened_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transaction_time');
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
    v_tx_at
  );

  INSERT INTO public.cash_transactions (
    venue_id,
    shift_id,
    type,
    payment_method,
    amount,
    transaction_at,
    note
  ) VALUES (
    p_venue_id,
    p_shift_id,
    'collection',
    'cash',
    p_amount,
    v_tx_at,
    NULLIF(btrim(COALESCE(p_note, '')), '')
  );

  UPDATE shifts
  SET cash_collections_total = COALESCE(cash_collections_total, 0) + p_amount
  WHERE id = p_shift_id
    AND venue_id = p_venue_id;

  SELECT pos_shift_cash_summary(p_venue_id, p_shift_id) INTO v_summary;
  RETURN v_summary;
END;
$$;
