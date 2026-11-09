---
name: wings-project
description: >-
  Wings monorepo layout, tech stack, dev commands, and file placement conventions.
  Use when onboarding to the repo, adding features, or unsure where code belongs.
---

# Wings Project

## What this is

Notion-style journal: nested pages, block editor, sharing, optional realtime collab, BYOK AI. Deployed on Vercel + Supabase (+ optional collab server).

## Layout

```
src/                    Frontend (React + Vite)
  pages/                Route-level pages (Index, Auth, Landing, EditorE2E)
  components/           UI + BlockEditor/
  lib/                  journal, markdown, draftCache, collab, ai/
  integrations/supabase/  Client + generated types
  hooks/                useAuth, etc.
supabase/
  migrations/           SQL (never edit old files)
  functions/            Deno edge functions
collab/                 Hocuspocus server (separate package.json)
tests/                  Playwright E2E
scripts/                recover-entries.ts, etc.
```

## Stack

| Layer | Tech |
|-------|------|
| UI | React 18, TypeScript, Vite, Tailwind, shadcn/Radix |
| Editor | TipTap 3, ProseMirror, lowlight, KaTeX, Excalidraw |
| Data | Supabase (Postgres, Auth, Storage, Edge Functions) |
| Collab | Yjs, Hocuspocus (optional) |
| AI | Client-side BYOK (Google, OpenAI, Anthropic, …) |
| Tests | Vitest (jsdom), Playwright |

## Commands

```bash
npm run dev              # Vite on :8080
bun run test:editor      # markdown + BlockEditor unit tests
bun run test:e2e         # Playwright (starts dev server)
bun run test:ci          # both (CI)
bun run build
bun run recover:entries  # DB recovery dry run
cd collab && npm run dev # collab server :1234
supabase db push         # apply migrations
```

## Conventions

- Import alias `@/` → `src/`.
- Package manager in CI/scripts: **Bun** (`bun.lockb` must stay in sync).
- Dev port **8080** (not 5173) — OAuth redirect URLs must match.
- Vite `dedupe`: react, prosemirror-*, `@tiptap/core`, `@tiptap/pm`, `@tiptap/suggestion`.
- SPA: `vercel.json` rewrites all routes to `index.html`.

## Where to add things

| Task | Location |
|------|----------|
| New page/route | `src/pages/` + `src/App.tsx` |
| New block type | `src/components/BlockEditor/*Extension*` + `editorExtensions.ts` |
| DB change | new file in `supabase/migrations/` |
| Edge function | `supabase/functions/<name>/index.ts` |
| Shared lib | `src/lib/` |
| E2E test | `tests/*.spec.ts`, harness at `/__editor-e2e` |

## Related skills

- Editor work → **wings-block-editor**, **wings-data-safety**
- DB/RLS → **wings-supabase**
- Deploy → **wings-deploy**
