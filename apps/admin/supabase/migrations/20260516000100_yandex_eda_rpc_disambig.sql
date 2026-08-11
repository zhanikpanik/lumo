-- Yandex Eda Phase 1A: disambiguate column references inside the helper RPCs.
--
-- The previous definitions in 20260516000000_yandex_eda_phase1a.sql declared
-- RETURNS TABLE columns whose names collided with real columns in
-- marketplace_access_tokens, so PostgreSQL refused to run the function body
-- with error 42702 (`column reference is ambiguous`). We rename the OUT
-- columns to out_* so all references inside the function unambiguously bind
-- to the underlying table columns. Postgres forbids changing the return
-- signature with CREATE OR REPLACE, so we drop and recreate.

DROP FUNCTION IF EXISTS marketplace_yandex_issue_token(uuid, text, text[], int);
DROP FUNCTION IF EXISTS marketplace_yandex_validate_token(text);

CREATE FUNCTION marketplace_yandex_issue_token(
  p_client_uuid  uuid,
  p_token_hash   text,
  p_scopes       text[],
  p_ttl_seconds  int DEFAULT 3600
)
RETURNS TABLE (
  out_token_hash  text,
  out_issued_at   timestamptz,
  out_expires_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ttl_seconds int := GREATEST(60, COALESCE(p_ttl_seconds, 3600));
BEGIN
  IF p_client_uuid IS NULL OR p_token_hash IS NULL OR length(p_token_hash) = 0 THEN
    RAISE EXCEPTION 'token_args_required';
  END IF;

  DELETE FROM marketplace_access_tokens t
  WHERE t.expires_at < now() - interval '1 day';

  RETURN QUERY
  INSERT INTO marketplace_access_tokens AS t (token_hash, client_uuid, scopes, expires_at)
  VALUES (
    p_token_hash,
    p_client_uuid,
    COALESCE(p_scopes, ARRAY['read']::text[]),
    now() + make_interval(secs => v_ttl_seconds)
  )
  RETURNING t.token_hash, t.issued_at, t.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION marketplace_yandex_issue_token(uuid, text, text[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketplace_yandex_issue_token(uuid, text, text[], int) TO service_role;

CREATE FUNCTION marketplace_yandex_validate_token(p_token_hash text)
RETURNS TABLE (
  out_client_uuid     uuid,
  out_organization_id uuid,
  out_scopes          text[],
  out_expires_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token_hash IS NULL OR length(p_token_hash) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.client_uuid,
         c.organization_id,
         t.scopes,
         t.expires_at
  FROM marketplace_access_tokens t
  JOIN marketplace_api_clients c ON c.id = t.client_uuid AND c.enabled = true
  WHERE t.token_hash = p_token_hash
    AND t.expires_at > now()
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION marketplace_yandex_validate_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketplace_yandex_validate_token(text) TO service_role;
