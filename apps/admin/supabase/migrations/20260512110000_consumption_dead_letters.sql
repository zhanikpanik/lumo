-- P0: dead-letter table for failed stock consumption events.
-- Client outbox escalates events to this table after MAX_RETRIES (or when payload
-- gets too stale). The table is the single source of truth visible from admin
-- and other devices: a red banner in POS links into a modal with retry/ack.

CREATE TABLE IF NOT EXISTS pos_consumption_dead_letters (
  idempotency_key text PRIMARY KEY,
  venue_id        uuid NOT NULL REFERENCES venues(id),
  order_id        uuid REFERENCES orders(id) ON DELETE SET NULL,
  shift_id        uuid REFERENCES shifts(id) ON DELETE SET NULL,
  payload         jsonb NOT NULL,
  retries         int NOT NULL DEFAULT 0,
  last_error      text,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'acknowledged', 'resolved')),
  resolved_by     uuid REFERENCES users(id),
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consumption_dl_venue_status
  ON pos_consumption_dead_letters (venue_id, status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_consumption_dl_order
  ON pos_consumption_dead_letters (order_id);

ALTER TABLE pos_consumption_dead_letters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all reads" ON pos_consumption_dead_letters;
DROP POLICY IF EXISTS "Allow all inserts" ON pos_consumption_dead_letters;
DROP POLICY IF EXISTS "Allow all updates" ON pos_consumption_dead_letters;
DROP POLICY IF EXISTS "Allow all deletes" ON pos_consumption_dead_letters;
CREATE POLICY "Allow all reads" ON pos_consumption_dead_letters
  FOR SELECT USING (true);
CREATE POLICY "Allow all inserts" ON pos_consumption_dead_letters
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates" ON pos_consumption_dead_letters
  FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes" ON pos_consumption_dead_letters
  FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION pos_consumption_record_dead_letter(
  p_venue_id uuid,
  p_idempotency_key text,
  p_payload jsonb,
  p_retries int DEFAULT 0,
  p_last_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_access_allowed boolean;
  v_order_id uuid;
  v_shift_id uuid;
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

  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;

  IF p_payload IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payload_required');
  END IF;

  v_order_id := NULLIF(p_payload->>'orderId', '')::uuid;
  v_shift_id := NULLIF(p_payload->>'shiftId', '')::uuid;

  INSERT INTO pos_consumption_dead_letters AS d (
    idempotency_key, venue_id, order_id, shift_id, payload, retries, last_error, status, last_seen_at
  )
  VALUES (
    p_idempotency_key,
    p_venue_id,
    v_order_id,
    v_shift_id,
    p_payload,
    GREATEST(COALESCE(p_retries, 0), 0),
    p_last_error,
    'open',
    now()
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET payload = EXCLUDED.payload,
      retries = GREATEST(d.retries, EXCLUDED.retries),
      last_error = EXCLUDED.last_error,
      last_seen_at = now(),
      status = CASE
        WHEN d.status = 'resolved' THEN 'resolved'
        ELSE 'open'
      END,
      -- If the row was previously acknowledged/resolved but a new failure
      -- appeared, clear resolution metadata so the UI flags it again.
      resolved_at = CASE WHEN d.status = 'resolved' THEN d.resolved_at ELSE NULL END,
      resolved_by = CASE WHEN d.status = 'resolved' THEN d.resolved_by ELSE NULL END;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION pos_consumption_retry_dead_letter(
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_access_allowed boolean;
  v_row record;
  v_payload jsonb;
  v_lines jsonb;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_row
  FROM pos_consumption_dead_letters
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dead_letter_not_found');
  END IF;

  v_role := auth.role();
  IF v_role IN ('service_role', 'anon') THEN
    v_access_allowed := true;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.user_id = auth.uid() AND uv.venue_id = v_row.venue_id
    ) INTO v_access_allowed;
  ELSE
    v_access_allowed := false;
  END IF;

  IF NOT COALESCE(v_access_allowed, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_row.status = 'resolved' THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'status', 'resolved');
  END IF;

  v_payload := v_row.payload;
  v_lines := COALESCE(v_payload->'lines', '[]'::jsonb);

  v_result := pos_finalize_order_stock(
    v_row.venue_id,
    (v_payload->>'orderId')::uuid,
    COALESCE((v_payload->>'occurredAt')::timestamptz, now()),
    v_lines,
    NULLIF(v_payload->>'shiftId', '')::uuid,
    COALESCE((v_payload->>'strictInsufficientStock')::boolean, true)
  );

  IF COALESCE((v_result->>'ok')::boolean, false) THEN
    UPDATE pos_consumption_dead_letters
    SET status = 'resolved',
        resolved_at = now(),
        last_seen_at = now(),
        last_error = NULL
    WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', COALESCE((v_result->>'duplicate')::boolean, false),
      'result', v_result
    );
  END IF;

  UPDATE pos_consumption_dead_letters
  SET retries = retries + 1,
      last_error = COALESCE(v_result->>'error', 'retry_failed'),
      last_seen_at = now()
  WHERE idempotency_key = p_idempotency_key;

  RETURN jsonb_build_object(
    'ok', false,
    'error', COALESCE(v_result->>'error', 'retry_failed'),
    'detail', v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION pos_consumption_ack_dead_letter(
  p_idempotency_key text,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_access_allowed boolean;
  v_venue_id uuid;
  v_actor_role user_role;
BEGIN
  SELECT venue_id INTO v_venue_id
  FROM pos_consumption_dead_letters
  WHERE idempotency_key = p_idempotency_key;

  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dead_letter_not_found');
  END IF;

  v_role := auth.role();
  IF v_role IN ('service_role', 'anon') THEN
    v_access_allowed := true;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.user_id = auth.uid() AND uv.venue_id = v_venue_id
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
      ON uv.user_id = u.id AND uv.venue_id = v_venue_id
    WHERE u.id = p_actor_user_id
    LIMIT 1;

    IF v_actor_role IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'actor_not_allowed');
    END IF;

    IF v_actor_role = 'waiter' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'actor_forbidden_role');
    END IF;
  END IF;

  UPDATE pos_consumption_dead_letters
  SET status = 'acknowledged',
      resolved_at = now(),
      resolved_by = p_actor_user_id,
      last_seen_at = now()
  WHERE idempotency_key = p_idempotency_key
    AND status <> 'resolved';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION pos_consumption_record_dead_letter(uuid, text, jsonb, int, text) TO anon;
GRANT EXECUTE ON FUNCTION pos_consumption_record_dead_letter(uuid, text, jsonb, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_consumption_record_dead_letter(uuid, text, jsonb, int, text) TO service_role;

GRANT EXECUTE ON FUNCTION pos_consumption_retry_dead_letter(text) TO anon;
GRANT EXECUTE ON FUNCTION pos_consumption_retry_dead_letter(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_consumption_retry_dead_letter(text) TO service_role;

GRANT EXECUTE ON FUNCTION pos_consumption_ack_dead_letter(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION pos_consumption_ack_dead_letter(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_consumption_ack_dead_letter(text, uuid) TO service_role;
