-- Yandex Eda Phase 1A: read-only menu/restaurants integration.
--
-- 1) Widen provider CHECK constraints on marketplace_* tables to allow 'yandex_eda'.
-- 2) Add marketplace_api_clients   — OAuth2 client_credentials (client_id + salted SHA-256 secret).
-- 3) Add marketplace_access_tokens — short-lived bearer tokens (hashed at rest + TTL).
-- 4) Add helpers: marketplace_yandex_issue_token, marketplace_yandex_validate_token,
--    marketplace_cleanup_access_tokens.
-- 5) Best-effort pg_cron schedule for hourly token cleanup (no-op if extension is unavailable).
--
-- All marketplace_* objects stay locked down to service_role: tables FORCE RLS with no
-- policies, and EXECUTE on the helper functions is granted only to service_role.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Widen provider CHECK constraints
-- ─────────────────────────────────────────────────────────────────────────────

-- marketplace_store_bindings
ALTER TABLE marketplace_store_bindings
  DROP CONSTRAINT IF EXISTS marketplace_store_bindings_provider_check;
ALTER TABLE marketplace_store_bindings
  ADD CONSTRAINT marketplace_store_bindings_provider_check
  CHECK (provider IN ('glovo', 'yandex_eda'));

-- marketplace_inbound_events
ALTER TABLE marketplace_inbound_events
  DROP CONSTRAINT IF EXISTS marketplace_inbound_events_provider_check;
ALTER TABLE marketplace_inbound_events
  ADD CONSTRAINT marketplace_inbound_events_provider_check
  CHECK (provider IN ('glovo', 'yandex_eda'));

-- marketplace_modifier_bindings
ALTER TABLE marketplace_modifier_bindings
  DROP CONSTRAINT IF EXISTS marketplace_modifier_bindings_provider_check;
ALTER TABLE marketplace_modifier_bindings
  ADD CONSTRAINT marketplace_modifier_bindings_provider_check
  CHECK (provider IN ('glovo', 'yandex_eda'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) marketplace_api_clients — registered OAuth client_credentials clients.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketplace_api_clients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            text NOT NULL CHECK (provider IN ('yandex_eda')),
  client_id           text NOT NULL,
  client_secret_hash  text NOT NULL,
  client_secret_salt  text NOT NULL,
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scopes              text[] NOT NULL DEFAULT ARRAY['read']::text[],
  enabled             boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, client_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_api_clients_org
  ON marketplace_api_clients (organization_id);

ALTER TABLE marketplace_api_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_api_clients FORCE ROW LEVEL SECURITY;
REVOKE ALL ON marketplace_api_clients FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) marketplace_access_tokens — short-lived bearer tokens, stored hashed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketplace_access_tokens (
  token_hash    text PRIMARY KEY,
  client_uuid   uuid NOT NULL REFERENCES marketplace_api_clients(id) ON DELETE CASCADE,
  scopes        text[] NOT NULL,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketplace_access_tokens_expires_at
  ON marketplace_access_tokens (expires_at);

CREATE INDEX IF NOT EXISTS idx_marketplace_access_tokens_client_uuid
  ON marketplace_access_tokens (client_uuid);

ALTER TABLE marketplace_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_access_tokens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON marketplace_access_tokens FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Helper RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- Issue a token after the edge function has verified the client secret.
-- Returns the freshly written row so the function can echo expires_at to the caller.
CREATE OR REPLACE FUNCTION marketplace_yandex_issue_token(
  p_client_uuid  uuid,
  p_token_hash   text,
  p_scopes       text[],
  p_ttl_seconds  int DEFAULT 3600
)
RETURNS TABLE (
  token_hash  text,
  issued_at   timestamptz,
  expires_at  timestamptz
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

  -- Opportunistic cleanup so the table cannot grow unboundedly even without pg_cron.
  DELETE FROM marketplace_access_tokens
  WHERE expires_at < now() - interval '1 day';

  RETURN QUERY
  INSERT INTO marketplace_access_tokens (token_hash, client_uuid, scopes, expires_at)
  VALUES (
    p_token_hash,
    p_client_uuid,
    COALESCE(p_scopes, ARRAY['read']::text[]),
    now() + make_interval(secs => v_ttl_seconds)
  )
  RETURNING marketplace_access_tokens.token_hash,
            marketplace_access_tokens.issued_at,
            marketplace_access_tokens.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION marketplace_yandex_issue_token(uuid, text, text[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketplace_yandex_issue_token(uuid, text, text[], int) TO service_role;

-- Validate a token hash. Returns the owning client + organization (NULL row on miss/expired).
CREATE OR REPLACE FUNCTION marketplace_yandex_validate_token(p_token_hash text)
RETURNS TABLE (
  client_uuid     uuid,
  organization_id uuid,
  scopes          text[],
  expires_at      timestamptz
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

-- Bulk cleanup helper — safe to call from pg_cron or manually.
CREATE OR REPLACE FUNCTION marketplace_cleanup_access_tokens()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM marketplace_access_tokens
  WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION marketplace_cleanup_access_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketplace_cleanup_access_tokens() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Best-effort pg_cron schedule (no-op if the extension isn't available).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;

      -- Drop a previous schedule if it exists, so the migration is idempotent.
      PERFORM cron.unschedule(j.jobid)
      FROM cron.job j
      WHERE j.jobname = 'marketplace_cleanup_access_tokens';

      PERFORM cron.schedule(
        'marketplace_cleanup_access_tokens',
        '*/15 * * * *',
        $cron$ SELECT public.marketplace_cleanup_access_tokens(); $cron$
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron not available; rely on marketplace_yandex_issue_token opportunistic cleanup';
  END IF;
END;
$$;
