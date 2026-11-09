---
name: wings-supabase
description: >-
  Wings Supabase schema, migrations, RLS policies, triggers, edge functions, and
  storage. Use when writing SQL migrations, RLS, RPCs, or Deno edge functions.
---

# Wings Supabase

## Key paths

```
supabase/migrations/     Chronological SQL — never edit old files
supabase/functions/      Deno edge functions
supabase/config.toml     Project config, JWT settings
src/integrations/supabase/types.ts   Generated types (may lag migrations)
src/lib/journal.ts       Entry CRUD from client
```

## Core tables

### `entries`
- `content` TEXT, `content_json` JSONB, `content_yjs` BYTEA (collab)
- `title`, `parent_id`, `pinned`, `share_token`, `layout`, `deleted_at`
- `search_tsv` generated column (FTS on title + content)

### `entry_shares`
- Roles: `viewer`, `editor`, `admin`
- Links entry to user or email

### `user_preferences`
- Includes `username` (public URL slug)

### `entry_versions`, `entry_comments`
- Version snapshots and block comments (RLS by entry access)

## Migrations workflow

```bash
supabase link --project-ref <ref>
supabase db push                    # apply migrations
supabase functions deploy <name>    # deploy edge function
supabase secrets set --env-file supabase/functions/.env
```

**Rules:**
- New migration file per change (`YYYYMMDDHHMMSS_description.sql`)
- Never modify applied migrations
- Grant privileges to `authenticated` / `service_role` explicitly when adding tables

## RLS model

| Actor | entries |
|-------|---------|
| Owner | Full CRUD on own rows |
| Shared viewer | SELECT |
| Shared editor | SELECT, UPDATE content |
| Shared admin | + delete, manage shares |
| **anon** | **No direct SELECT** on entries |

Public share pages: `get_shared_entry(_token)` SECURITY DEFINER RPC only.

## Triggers (do not fight them)

**`protect_entry_sensitive_columns`** on `entries`:
- `user_id` immutable for everyone
- Non-owners cannot change `share_token` or `parent_id`
- `service_role` exempt

**`parent_id` FK**: ON DELETE SET NULL (not CASCADE).

## Edge functions

| Function | JWT | Notes |
|----------|-----|-------|
| `auth-send-email` | false | Auth hook → Resend; **return 200 even on error** |
| `send-email` | true | App transactional email |
| `create-checkout-session` | true | Dodo Payments |
| `fetch-link-preview` | — | OG metadata for bookmark blocks |

Shared: `supabase/functions/_shared/mail.ts`, `cors.ts`, `templates.ts`

Secrets live in Supabase secrets — **never** `VITE_*`.

## Storage

- Bucket `journal-images`: authenticated upload, public read
- Upload helper: `src/lib/imageUpload.ts`

## Client patterns

```ts
const ENTRY_COLS = "id, content, content_json, created_at, user_id, pinned, parent_id, title, share_token, layout, deleted_at";
```

- Soft delete: `deleted_at` set, not hard DELETE
- `fetchEntries` merges own + shared entries with `roleMap`
- `updateEntry` writes `{ content, content_json }` — see **wings-data-safety**

## Gotchas

- `content_yjs` may be missing from generated types until regen
- `shared_entries_view` was **dropped** — do not recreate wide anon view
- Username RPCs: race-safe signup, reserved names (`20260715030300_*`)
- Anon lock migration: `20260715030100_lock_anon_entries.sql`

## Detailed RLS / RPC reference

See [reference.md](reference.md).

## Related

- **wings-sharing** — share tokens, roles
- **wings-collab** — `content_yjs` writes via service role
- **wings-deploy** — secrets and env
