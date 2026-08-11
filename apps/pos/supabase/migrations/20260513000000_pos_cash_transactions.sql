-- P0: cashier-initiated cash transactions (float_in / float_out).
-- Modeled after pos_record_cash_collection. Distinct guard against
-- insufficient cash on float_out so the drawer can never go negative.

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
  v_delta numeric(10,2);
  v_available numeric(10,2);
  v_summary jsonb;
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
  ELSIF p_kind = 'out' THEN
    v_movement_type := 'float_out';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  SELECT s.starting_cash, s.closed_at
  INTO v_starting_cash, v_shift_closed_at
  FROM shifts s
  WHERE s.id = p_shift_id
    AND s.venue_id = p_venue_id;

  IF v_starting_cash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shift_not_found');
  END IF;

  IF v_shift_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shift_not_open');
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
    COALESCE(p_occurred_at, now())
  );

  SELECT pos_shift_cash_summary(p_venue_id, p_shift_id) INTO v_summary;
  RETURN v_summary;
END;
$$;

REVOKE EXECUTE ON FUNCTION pos_record_cash_transaction(uuid, uuid, text, numeric, text, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos_record_cash_transaction(uuid, uuid, text, numeric, text, uuid, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION pos_record_cash_transaction(uuid, uuid, text, numeric, text, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_record_cash_transaction(uuid, uuid, text, numeric, text, uuid, timestamptz) TO service_role;
