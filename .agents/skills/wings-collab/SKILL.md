---
name: wings-collab
description: >-
  Wings realtime collaboration with Yjs, Hocuspocus, content_yjs persistence, and
  TipTap Collaboration extensions. Use when changing collab server, provider hook,
  or shared editing behavior.
---

# Wings Collab

## Architecture

```
Browser (shared entry + VITE_COLLAB_URL)
  → useCollabProvider → HocuspocusProvider (JWT)
  → Y.Doc ↔ TipTap Collaboration + CollaborationCaret
  → collab/server.ts (Hocuspocus + Database extension)
  → entries.content_yjs (bytea)
```

Solo mode (default): no WebSocket, normal autosave to `content` + `content_json`.

## Key files

```
src/lib/collab/useCollabProvider.ts   React hook, connects when enabled
src/lib/collab/collabExtensions.ts    Collaboration + CollaborationCaret
collab/server.ts                      Hocuspocus server
collab/README.md                      Setup
src/pages/Index.tsx                   Skips solo save when collab live; flush on disconnect
```

## Activation conditions

All must be true:

1. Entry has row in `entry_shares` (`entryHasShares`)
2. `VITE_COLLAB_URL` set at build time
3. User can edit (owner/admin/editor)

Room name: `entry:{uuid}`

## Server auth

`onAuthenticate` in `collab/server.ts`:

- Validates Supabase JWT via `admin.auth.getUser(token)`
- Checks owner or editor/admin share role
- Origin allowlist: `COLLAB_ALLOWED_ORIGINS`

**Service role key** on server only — never in frontend.

## Persistence

| Mode | Live | Durable |
|------|------|---------|
| Collab | Yjs in memory | `content_yjs` (debounced 2–10s) |
| Flush | On disconnect | `content` + `content_json` via `nw:collab-flush` |

Index skips debounced `updateEntry` while collab active:

```ts
if (entryShared && import.meta.env.VITE_COLLAB_URL) return;
```

## Editor changes in collab

- `StarterKit` undo/redo disabled — Yjs owns history
- `createCollabExtensions(ydoc, provider, user)` appended in BlockEditor
- `useEditor(..., [collabSession])` recreates editor when session toggles

## Local dev

```bash
# .env
VITE_COLLAB_URL=ws://localhost:1234

# collab/.env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

cd collab && npm install && npm run dev
supabase db push   # content_yjs column
```

## Gotchas

- **D7 (fixed 2026-07-16):** Server `fetch` seeds from `content_json` or markdown when `content_yjs` null — `collab/server.ts`, `collab/seedDocument.ts`. Persists binary once. Stub schema in `collab/seedExtensions.ts` must stay in sync with custom block names.
- Postgres `bytea` may arrive as hex string — server parses `\\x...` (`collab/server.ts:91-98`)
- `@hocuspocus/provider` and `@hocuspocus/server` are both v4; collab uses `new Server()` (built-in WebSocket), and `requestHeaders.get("origin")` (web `Headers`)
- Vercel CSP must allow `wss:` in `connect-src`

## Related

- **wings-data-safety** — dual save paths, flush
- **wings-sharing** — what enables collab
- **wings-deploy** — collab server deploy
