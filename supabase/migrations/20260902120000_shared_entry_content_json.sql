-- Public share pages: same document the owner sees (markdown + JSON).
-- Display fields only — no entry id, user_id, share_token, or parent_id.
-- Postgres rejects CREATE OR REPLACE when OUT parameters change — drop first.

DROP FUNCTION IF EXISTS public.get_shared_entry(text);

CREATE FUNCTION public.get_shared_entry(_token text)
RETURNS TABLE (title text, content text, content_json jsonb, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.title, e.content, e.content_json, e.created_at
  FROM public.entries e
  WHERE e.share_token IS NOT NULL
    AND e.share_token = _token
    AND e.deleted_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_entry(text) TO anon, authenticated;
