-- Personal access tokens, MCP OAuth grants, and API rate limits.
-- Additive only. Does not read, update, or delete entry content.

CREATE TABLE public.api_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  token_prefix text NOT NULL,
  secret_hash text NOT NULL,
  scopes text[] NOT NULL CHECK (
    scopes <@ ARRAY['read', 'write']::text[]
    AND scopes @> ARRAY['read']::text[]
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX api_tokens_user_active_idx
  ON public.api_tokens (user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE public.oauth_clients (
  id text PRIMARY KEY CHECK (id ~ '^wings_cli_[A-Za-z0-9_-]{16,64}$'),
  client_name text NOT NULL CHECK (char_length(client_name) BETWEEN 1 AND 120),
  redirect_uris text[] NOT NULL CHECK (cardinality(redirect_uris) BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.oauth_grants (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES public.oauth_clients (id),
  scopes text[] NOT NULL CHECK (
    scopes <@ ARRAY['read', 'write']::text[]
    AND scopes @> ARRAY['read']::text[]
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

CREATE INDEX oauth_grants_user_active_idx
  ON public.oauth_grants (user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE public.oauth_codes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES public.oauth_clients (id),
  grant_id uuid NOT NULL REFERENCES public.oauth_grants (id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  scopes text[] NOT NULL CHECK (
    scopes <@ ARRAY['read', 'write']::text[]
    AND scopes @> ARRAY['read']::text[]
  ),
  code_hash text NOT NULL,
  code_challenge text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE public.oauth_access_tokens (
  id uuid PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES public.oauth_grants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  secret_hash text NOT NULL,
  token_prefix text NOT NULL,
  scopes text[] NOT NULL CHECK (
    scopes <@ ARRAY['read', 'write']::text[]
    AND scopes @> ARRAY['read']::text[]
  ),
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz
);

CREATE TABLE public.oauth_refresh_tokens (
  id uuid PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES public.oauth_grants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  secret_hash text NOT NULL,
  token_prefix text NOT NULL,
  scopes text[] NOT NULL CHECK (
    scopes <@ ARRAY['read', 'write']::text[]
    AND scopes @> ARRAY['read']::text[]
  ),
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid,
  last_used_at timestamptz
);

CREATE TABLE public.api_rate_buckets (
  bucket text PRIMARY KEY CHECK (char_length(bucket) BETWEEN 1 AND 128),
  window_start timestamptz NOT NULL,
  hit_count integer NOT NULL CHECK (hit_count >= 0)
);

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.oauth_clients FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.oauth_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.oauth_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.oauth_access_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.oauth_refresh_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.api_rate_buckets FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.api_tokens TO service_role;
GRANT ALL ON TABLE public.oauth_clients TO service_role;
GRANT ALL ON TABLE public.oauth_grants TO service_role;
GRANT ALL ON TABLE public.oauth_codes TO service_role;
GRANT ALL ON TABLE public.oauth_access_tokens TO service_role;
GRANT ALL ON TABLE public.oauth_refresh_tokens TO service_role;
GRANT ALL ON TABLE public.api_rate_buckets TO service_role;

-- No policies. The service role bypasses RLS. A later GRANT to authenticated
-- cannot leak rows until a policy is added on purpose.

CREATE OR REPLACE FUNCTION public.api_rate_hit(
  p_bucket text,
  p_window_seconds integer,
  p_limit integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_count integer;
BEGIN
  IF p_bucket IS NULL OR char_length(p_bucket) < 1 OR char_length(p_bucket) > 128 THEN
    RETURN false;
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RETURN false;
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100000 THEN
    RETURN false;
  END IF;

  INSERT INTO public.api_rate_buckets AS rate (bucket, window_start, hit_count)
  VALUES (p_bucket, v_now, 1)
  ON CONFLICT (bucket) DO UPDATE
    SET
      window_start = CASE
        WHEN rate.window_start <= v_now - (p_window_seconds * interval '1 second') THEN v_now
        ELSE rate.window_start
      END,
      hit_count = CASE
        WHEN rate.window_start <= v_now - (p_window_seconds * interval '1 second') THEN 1
        ELSE rate.hit_count + 1
      END
  RETURNING hit_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.api_rate_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_rate_hit(text, integer, integer) TO service_role;
