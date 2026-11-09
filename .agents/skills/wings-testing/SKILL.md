---
name: wings-testing
description: >-
  Wings Vitest and Playwright testing patterns, editor regression suites, CI
  workflow, and E2E helpers. Use when adding tests or debugging CI failures.
---

# Wings Testing

## Scripts

```bash
bun run test              # all Vitest
bun run test:editor       # markdown.test.ts + BlockEditor.test.ts
bun run test:e2e          # Playwright editor specs
bun run test:ci           # editor + e2e (CI)
CI=1 E2E_PORT=8099 bun run test:e2e   # fresh server if :8080 busy
```

## Vitest

**Config:** `vitest.config.ts` — jsdom, `@/` alias, `src/test/setup.ts`

**Setup polyfills:** ProseMirror DOM APIs for TipTap in jsdom.

**What to unit test:**
- Extension wiring (Link count, priority, schema nodes)
- Markdown round-trip (`src/lib/markdown.test.ts`)
- Content resolution guards (`src/lib/editorContent.test.ts`)
- Suggestion plugin keys distinct

**What NOT to unit test in jsdom:**
- Enter/splitBlock keyboard paths — no DOM ranges
- Use Playwright instead

**Pattern:**

```ts
function makeEditor(content = "<p>hello</p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}
```

## Playwright

**Config:** `playwright.config.ts`

- Base URL `http://127.0.0.1:${E2E_PORT||8080}`
- Starts `bun run dev -- --host 127.0.0.1 --port …`
- `reuseExistingServer: !CI` — use `CI=1` for clean server

**Harness:** `/__editor-e2e` → `EditorE2E.tsx` (DEV only in App.tsx)

**Specs:**
- `tests/editor-enter.spec.ts` — Enter, markdown, code block, parity test IDs
- `tests/editor-notion-parity.spec.ts` — backspace merge, slash, Cmd+D, Esc
- `tests/editor-helpers.ts` — dismiss cookies, focus editor

**E2E tips:**
- Dismiss cookie banner before typing
- Slash menu: click `.slash-menu button` (Enter unreliable — Tippy focus)
- Toggle item: `getByRole('button', { name: 'Toggle Collapsible content' })`
- Caret: `page.evaluate(() => __nw_editor.commands.setTextSelection(n))`
- Code block: type ` ```ts` + Enter, assert `pre .code-block-content`

**Parity test IDs** (EditorE2E):

- `stored-text`, `markdown-preview`, `ai-request-text` — must match

## CI

`.github/workflows/editor-regression.yml`:

- Bun install `--frozen-lockfile`
- `bunx playwright install --with-deps chromium`
- `bun run test:ci`

Commit `bun.lockb` when dependencies change.

## When to add which test

| Change | Vitest | Playwright |
|--------|--------|------------|
| New extension registered | ✓ schema/wiring | if keyboard UX |
| Keymap priority | ✓ priority value | ✓ Enter + slash |
| Markdown rule | ✓ | ✓ if input rule |
| Save/load logic | ✓ editorContent | — |
| UI shell / auth | — | optional |

## CI failure diagnosis

| Failure | Likely cause | Fix |
|---------|--------------|-----|
| `.ProseMirror` not found | Editor crash on mount | Check ErrorBoundary; suggestion$ keys |
| `suggestion$` in stderr | Duplicate plugin key | suggestionPluginKeys.ts |
| Enter test fails | Priority wrong or stale bundle | priority 200; `CI=1 E2E_PORT=8099` |
| Slash menu timeout | Cookie banner or focus | dismissCookieBanner in helpers |
| Toggle strict mode | Ambiguous selector | exact role name |
| Link count test fails | StarterKit link not false | editorExtensions.ts |
| editorContent test fails | Guard regression | do not weaken guards |
| build fails PM types | Missing vite dedupe | vite.config.ts |

## What each test layer catches

```
Vitest (jsdom)     → wiring, guards, markdown round-trip
Playwright         → mount, keyboard, slash, real DOM
recover:entries    → DB-level content integrity
Manual smoke       → auth, navigation, multi-session
```

**The July 2026 incident:** Vitest passed, Playwright was not gate → crash + empty save shipped.

## Regression ownership

| Bug class | Owner test |
|-----------|------------|
| Empty JSON beats markdown | editorContent.test.ts |
| Empty autosave | editorContent.test.ts |
| Editor crash | BlockEditor.test.ts + E2E mount |
| Enter/slash | editor-enter.spec.ts, notion-parity |
| AI parity | editor-enter.spec.ts test IDs |

## Related

- **wings-block-editor** — pitfalls, extension rules
- **wings-data-safety** — content guard unit tests
- **wings-ship-gate** — Tier 1 commands
