# Local Setup — Detailed Guidelines

This guide walks through running Wings on your machine from scratch. For a conceptual overview first, see [BEGINNER_GUIDE.md](https://github.com/Sabique-Islam/wings/blob/master/.github/BEGINNER_GUIDE.md).

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Node.js](https://nodejs.org/) | 22 LTS or 24 | jsdom 30 does not list Node 25 in `engines`, so npm prints a harmless EBADENGINE warning on 25. |
| [Bun](https://bun.sh/) | latest | Used for CI, tests, and scripts (`bun.lockb`) |
| [Git](https://git-scm.com/) | any recent | Clone and branch |
| [Supabase CLI](https://supabase.com/docs/guides/cli) | optional | Only if you run a local Supabase stack or apply migrations yourself |

Optional:

- [Docker](https://www.docker.com/) — for local Supabase (`supabase start`)
- [Playwright browsers](https://playwright.dev/) — installed automatically via `bunx playwright install`

## 1. Clone the repository

```bash
git clone https://github.com/Sabique-Islam/wings.git
cd wings
```

## 2. Install dependencies

```bash
bun install --frozen-lockfile
```

If you do not have Bun yet:

```bash
curl -fsSL https://bun.sh/install | bash
bun install --frozen-lockfile
```

The frontend also works with `npm install` for day-to-day dev, but **CI uses Bun** — keep `bun.lockb` in sync when you change dependencies.

## 3. Environment variables

Copy the example env file:

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-or-publishable-key
```

### Where to get Supabase credentials

1. Create a project at [supabase.com](https://supabase.com/) (free tier works).
2. Go to **Project Settings → API**.
3. Copy **Project URL** → `VITE_SUPABASE_URL`.
4. Copy **anon public** key → `VITE_SUPABASE_PUBLISHABLE_KEY`.

Never commit `.env`. Never put service-role keys in `VITE_*` variables — those are embedded in the client bundle.

### Auth redirect URLs (required for login)

In Supabase **Authentication → URL Configuration**:

| Setting | Value |
|---------|-------|
| Site URL | `http://localhost:8080` (local) |
| Redirect URLs | `http://localhost:8080/auth/callback` |

Production uses `https://wings.nopejs.me/auth/callback` — see `.env.example` for the full list.

**Important:** Wings dev server runs on port **8080**, not Vite's default 5173. OAuth will fail if redirect URLs use the wrong port.

### Google OAuth (optional but recommended)

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth client (Web).
2. **Authorized JavaScript origins:** `http://localhost:8080`
3. **Authorized redirect URIs:** `https://<your-project>.supabase.co/auth/v1/callback`
4. Supabase → Authentication → Providers → Google → paste Client ID and Secret.

Magic link email requires the `auth-send-email` edge function and Resend — skip for local dev if you use Google OAuth only.

### Optional: collaboration server

Realtime shared editing is optional. Solo autosave works without collab.

```env
VITE_COLLAB_URL=ws://localhost:1234
```

See [Collab server](#6-optional-collaboration-server) below.

## 4. Database schema

Apply migrations to your Supabase project:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

Or run migrations manually from `supabase/migrations/` in the Supabase SQL editor (in filename order).

**Never edit old migration files.** Add a new timestamped migration for every schema change.

## 5. Start the dev server

```bash
bun run dev
# or: npm run dev
```

Open [http://localhost:8080](http://localhost:8080).

### Verify the editor harness (dev only)

Visit [http://localhost:8080/__editor-e2e](http://localhost:8080/__editor-e2e). You should see a `.ProseMirror` editor with no error boundary. This route is used by Playwright and is the fastest sanity check after editor changes.

## 6. Optional: collaboration server

Only needed for realtime multi-user editing on shared pages.

```bash
cd collab
npm install
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
export COLLAB_ALLOWED_ORIGINS=http://localhost:8080
npm run dev
```

In the root `.env`:

```env
VITE_COLLAB_URL=ws://localhost:1234
```

Apply the Yjs migration:

```bash
supabase db push   # includes 20260716100000_content_yjs.sql
```

See [collab/README.md](https://github.com/Sabique-Islam/wings/blob/master/collab/README.md) for auth and persistence details.

## 7. Run tests

### Editor unit tests (Vitest)

```bash
bun run test:editor
```

Covers markdown round-trip, editor content guards, BlockEditor wiring, and related lib tests.

### End-to-end tests (Playwright)

```bash
bunx playwright install --with-deps chromium   # first time only
bun run test:e2e
```

Playwright starts the dev server automatically. If port 8080 is already in use:

```bash
CI=1 E2E_PORT=8099 bun run test:e2e
```

### Full CI locally

```bash
bun run test:ci && bun run build
```

### Watch mode (unit tests)

```bash
bun run test:watch
```

## 8. Lint

```bash
bun run lint
```

## 9. Production build preview

```bash
bun run build
bun run preview
```

Smoke-test save/load on the preview build when changing persistence logic — dev and production builds can behave differently.

## 10. Recovery script (advanced)

Dry-run check for entries with suspicious empty `content_json`:

```bash
bun run recover:entries
```

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env`. **Do not run `--apply` unless you understand the output** — see `scripts/recover-entries.ts`.

## Troubleshooting

### OAuth redirect mismatch

- Confirm dev server is on **8080** (`vite.config.ts`).
- Confirm Supabase redirect URL is exactly `http://localhost:8080/auth/callback`.
- Clear site data / use incognito after changing auth config.

### Blank page after login

- Check browser console for Supabase errors.
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Run `bun run recover:entries` if content exists in DB but not in UI.

### Playwright fails to start server

- Kill any process on 8080: `lsof -i :8080`
- Or use `CI=1 E2E_PORT=8099 bun run test:e2e`

### TipTap / ProseMirror duplicate package errors

Vite dedupes React and TipTap packages in `vite.config.ts`. If you add a new `@tiptap/*` dependency, ensure it is listed in the `dedupe` array.

### `bun install --frozen-lockfile` fails

Run `bun install` locally and commit the updated `bun.lockb` if you intentionally changed dependencies.

## Project layout (quick reference)

```
src/                    Frontend (React + Vite)
  pages/                Routes (Index, Auth, Landing, EditorE2E)
  components/           UI + BlockEditor/
  lib/                  journal, markdown, draftCache, collab, ai/
  integrations/supabase/  Client + generated types
supabase/
  migrations/           SQL migrations
  functions/            Deno edge functions
collab/                 Hocuspocus WebSocket server
tests/                  Playwright E2E specs
scripts/                recover-entries.ts, etc.
```

## Next steps

- Read [BEGINNER_GUIDE.md](https://github.com/Sabique-Islam/wings/blob/master/.github/BEGINNER_GUIDE.md) if the layout is new to you.
- Read [CONTRIBUTING.md](https://github.com/Sabique-Islam/wings/blob/master/.github/CONTRIBUTING.md) before opening a PR.
- Editor work: [wings-block-editor](https://github.com/Sabique-Islam/wings/blob/master/.cursor/skills/wings-block-editor/SKILL.md) and [wings-data-safety](https://github.com/Sabique-Islam/wings/blob/master/.cursor/skills/wings-data-safety/SKILL.md).
