---
name: wings-auth-routing
description: >-
  Wings authentication (Supabase magic link, Google OAuth, PKCE), React Router
  layout, username-gated URLs, and session handling. Use when changing auth flows,
  routes, or public vs protected pages.
---

# Wings Auth & Routing

## Key files

```
src/App.tsx              Route table, UsernameGate, RequireAuth
src/hooks/useAuth.tsx    AuthProvider, session, legacy redirect
src/pages/Auth.tsx       Magic link + Google OAuth
src/pages/AuthCallback.tsx   PKCE callback
src/lib/auth.ts          Auth helpers
src/lib/profile.ts       getMyUsername, profile CRUD
src/lib/username.ts      Validation, reserved names
src/pages/Index.tsx      Main app (journal)
```

## Route map

| Path | Guard | Purpose |
|------|-------|---------|
| `/` | Public | Landing |
| `/auth`, `/auth/callback` | Public | Sign-in |
| `/app`, `/app/n/:id` | RequireAuth | Journal |
| `/n/:id` | RequireAuth | Journal (alt) |
| `/:username`, `/:username/n/:id` | UsernameGate | Pretty URLs |
| `/s/:token` | Public | Shared read-only entry |
| `/__editor-e2e` | DEV only | Playwright harness |
| `/pricing`, `/legal/*` | Public | Marketing |

## UsernameGate flow

1. User must be authenticated
2. Poll `getMyUsername(userId)` (retries in App.tsx)
3. URL `:username` must match logged-in user's username (case-insensitive)
4. Mismatch → `NotFound`

## OAuth / magic link

- Google: PKCE flow → `/auth/callback` on app domain
- Supabase Auth callback URL is on **Supabase project domain**
- Redirect URLs in Supabase dashboard must include:
  - `http://localhost:8080/**` (dev port 8080)
  - Production domain

## Index navigation

```ts
const basePath = username ? `/${username}` : location.pathname.startsWith("/app") ? "/app" : "";
navigate(id ? `${basePath}/n/${id}` : basePath || "/app");
```

## Session errors

`entryErrorMessage()` in Index maps JWT/RLS/network errors to user-facing toasts.

## Cookie consent

`CookieBanner` — Vercel Analytics gated on opt-in. E2E tests must dismiss banner (`tests/editor-helpers.ts`).

## Related

- **wings-supabase** — `user_preferences.username`, RPCs
- **wings-sharing** — public `/s/:token` route
- **wings-deploy** — auth redirect env checklist
