# Supabase Reference — Wings

## Entry access helpers (SQL functions)

Used in RLS policies — search migrations for definitions:

- `is_entry_owner(entry_id)` — caller owns entry
- `has_entry_share_role(entry_id, roles[])` — caller has share role

## Public share RPC

```sql
get_shared_entry(_token text)
  → id, title, content, created_at
  -- Only exact 32-char hex token, non-deleted, share_token set
```

Client: `src/pages/SharedEntry.tsx`

## Username RPCs

- `get_user_id_by_username(username)`
- `is_username_available(username)`
- `lookup_username` — used by UsernameGate

## Grants pattern (from migrations)

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
GRANT ALL ON public.entries TO service_role;
-- anon: REVOKE direct SELECT on entries
GRANT EXECUTE ON FUNCTION public.get_shared_entry(text) TO anon, authenticated;
```

## Regenerating types

After schema change, regenerate `src/integrations/supabase/types.ts` via Supabase CLI and commit.

## Recovery SQL (manual)

Clear empty JSON blocking markdown display:

```sql
UPDATE entries
SET content_json = NULL
WHERE btrim(content) <> ''
  AND (
    content_json IS NULL
    OR content_json->'content' = '[]'::jsonb
  );
```

Prefer `bun run recover:entries:apply` — same logic with reporting.

## Point-in-time restore

Supabase Dashboard → Project → Database → Backups. Use for rows where both `content` and `content_json` were overwritten to empty.
