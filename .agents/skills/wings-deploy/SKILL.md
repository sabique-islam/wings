---
name: wings-deploy
description: >-
  Wings deployment on Vercel, Supabase setup, collab server, environment variables,
  and secrets. Use when configuring production, CI env, or OAuth redirect URLs.
---

# Wings Deploy

## Components

| Component | Host | Build |
|-----------|------|-------|
| Frontend | Vercel | `npm run build` |
| Database/Auth | Supabase | `supabase db push` |
| Edge functions | Supabase | `supabase functions deploy` |
| Collab (optional) | Fly/Railway/Render | `collab/` separate process |

## Frontend env (`VITE_*` — baked at build)

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_SUPABASE_URL` | Yes | |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Anon key |
| `VITE_COLLAB_URL` | No | `wss://…` for production collab |
| `VITE_DODO_MODE`, `VITE_DODO_PUBLIC_KEY` | No | Payments |

See `.env.example` for full list.

## Server-only secrets (never VITE_)

**Supabase edge** (`supabase secrets set --env-file supabase/functions/.env`):

- `RESEND_API_KEY`, `MAIL_FROM_*`, `SITE_URL`
- `SEND_EMAIL_HOOK_SECRET`
- Dodo payment secrets

**Collab server:**

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `COLLAB_PORT` (default 1234)
- `COLLAB_ALLOWED_ORIGINS`

**Recovery script:**

- `SUPABASE_SERVICE_ROLE_KEY` in local `.env`

## Vercel

`vercel.json`:

- SPA rewrite to `index.html`
- CSP `connect-src` includes `wss:` for collab
- Install: `npm install --legacy-peer-deps` (Excalidraw peers)

## Supabase checklist

1. Apply migrations: `supabase db push`
2. Auth redirect URLs: localhost:8080 + production
3. Google OAuth client + Supabase provider
4. Deploy `auth-send-email` hook + Resend
5. Storage bucket `journal-images` policies
6. Deploy `fetch-link-preview` for bookmark blocks

## Collab deploy

1. Apply `20260716100000_content_yjs.sql`
2. Deploy `collab/server.ts` with WebSocket support
3. Set `VITE_COLLAB_URL=wss://your-collab-host` on Vercel rebuild

Collab is **optional** — solo autosave works without it.

## Post-deploy verification

```bash
bun run test:ci
bun run recover:entries   # check no hidden content_json issues
```

## Related

- **wings-supabase** — migrations, functions
- **wings-collab** — collab server setup
- **wings-auth-routing** — OAuth redirect URLs
