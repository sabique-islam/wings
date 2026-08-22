-- Saved page queries. Membership is evaluated on the client (filters ∩ then ∪ allow_list).
-- Owner-only. Never touches entries content.

CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  rules jsonb NOT NULL DEFAULT '{"filters":[]}'::jsonb,
  allow_list uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX collections_user_id_idx ON public.collections (user_id);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own collections"
  ON public.collections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own collections"
  ON public.collections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own collections"
  ON public.collections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own collections"
  ON public.collections FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;

CREATE OR REPLACE FUNCTION public.is_reserved_username(_username text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(_username) = ANY (ARRAY[
    'admin','root','auth','login','logout','signup','signin',
    'api','app','n','s','c','trash','pricing','about','careers','blog',
    'contact','changelog','roadmap','docs','support','status',
    'press','legal','privacy','terms','security','cookies',
    'settings','account','profile','user','users','team',
    'dashboard','home','help','sitemap','robots','well-known',
    'billing','checkout','pay','payments','404','500'
  ]);
$$;
