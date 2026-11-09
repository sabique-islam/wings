---
name: wings-sharing
description: >-
  Wings entry sharing, share tokens, role-based access (viewer/editor/admin),
  ShareMenu, and public read-only pages. Use when changing permissions, share
  links, or collab activation.
---

# Wings Sharing

## Roles

| Role | Read | Edit content | Delete | Manage shares |
|------|------|--------------|--------|---------------|
| owner | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ | ✓ |
| editor | ✓ | ✓ | — | — |
| viewer | ✓ | — | — | — |

`ShareRole` type in `src/lib/journal.ts`. `roleMap` built in `fetchEntries`.

## Key files

```
src/components/ShareMenu.tsx     Share UI, token generation
src/lib/journal.ts               entry_shares queries, entryHasShares
src/pages/SharedEntry.tsx        Public /s/:token page
src/components/JournalEditor.tsx canEditRole(), canManage, canDelete
```

## Share token (public link — separate from invites)

- 32-char hex stored in `entries.share_token`
- Only **owner** can change token (DB trigger)
- Public access: `get_shared_entry(token)` RPC — no anon table scan

## Internal invite → recipient workspace

Email invite writes `entry_shares` (no public token). Recipient sidebar loads via:

```ts
supabase.rpc("fetch_share_workspace") // claims pending email invites, returns
// { collaborators: entries+role, owned_shared_ids: uuid[] }
```

- Client: `mapShareWorkspacePayload` in `journal.ts` — no email matching in TS
- Instant: Realtime on `entry_shares` → `loadEntries({ refreshShares: true })`
- Same-tab owner: `nw:shares-changed` CustomEvent

## Collab activation

`sharedEntryIds` = collaborator entry ids ∪ `owned_shared_ids`. When set + `VITE_COLLAB_URL`, Yjs session starts.

## UI permissions

```ts
canEditRole(role)   // owner | admin | editor
canManage           // owner | admin — ShareMenu, pin, subpage
canDelete           // owner | admin
```

Viewers see "view only" badge in header.

## Subpage ownership

`resolveEntryOwnerId()` in Index — subpages under shared parent owned by parent's `user_id` when creator is not owner.

## Security rules

- Never re-add anon SELECT policy on `entries`
- Do not expose `user_id` / `share_token` from `get_shared_entry`
- Shared editors: UPDATE allowed but trigger blocks `user_id`, `share_token`, `parent_id` changes

## Related

- **wings-supabase** — RLS, `entry_shares`, triggers
- **wings-collab** — shared entries enable collab
