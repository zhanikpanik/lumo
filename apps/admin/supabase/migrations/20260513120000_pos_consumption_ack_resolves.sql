-- Make "Решено вручную" finalize the dead-letter row.
--
-- Previously `pos_consumption_ack_dead_letter` set status = 'acknowledged',
-- which still satisfied the client filter `.neq('status', 'resolved')` —
-- so the red banner never went away. Operators expect this action to close
-- the record; the intermediate 'acknowledged' state was never used in UI.
--
-- After this migration: ack puts the row into 'resolved' immediately.
-- The CHECK constraint already allows 'resolved', so no schema changes.

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
  SET status = 'resolved',
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

GRANT EXECUTE ON FUNCTION pos_consumption_ack_dead_letter(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION pos_consumption_ack_dead_letter(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_consumption_ack_dead_letter(text, uuid) TO service_role;
