-- Re-process dead letters now that workshop_id is fixed
-- Run in Supabase SQL Editor
DO $$
DECLARE
  dl RECORD;
  res jsonb;
BEGIN
  FOR dl IN
    SELECT idempotency_key, order_id, payload
    FROM pos_consumption_dead_letters
    WHERE status = 'open'
      AND venue_id = '00000000-0000-0000-0000-000000000010'
  LOOP
    res := pos_finalize_order_stock(
      p_venue_id    := (dl.payload->>'venueId')::uuid,
      p_order_id    := dl.order_id,
      p_occurred_at := (dl.payload->>'occurredAt')::timestamptz,
      p_lines       := (dl.payload->'lines')::jsonb,
      p_shift_id    := NULLIF(dl.payload->>'shiftId', '')::uuid,
      p_strict_insufficient := false  -- allow negative stock
    );

    IF (res->>'ok')::boolean THEN
      UPDATE pos_consumption_dead_letters
      SET status = 'resolved', resolved_at = now()
      WHERE idempotency_key = dl.idempotency_key;
      RAISE NOTICE 'OK: %', dl.idempotency_key;
    ELSE
      RAISE WARNING 'FAIL: % → %', dl.idempotency_key, res->>'error';
    END IF;
  END LOOP;
END $$;

-- Verify
SELECT idempotency_key, status FROM pos_consumption_dead_letters WHERE status = 'open';
