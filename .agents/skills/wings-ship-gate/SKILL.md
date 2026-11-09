---
name: wings-ship-gate
description: >-
  Mandatory pre-merge and pre-deploy checklist for Wings. Use before any PR,
  production deploy, or editor/persistence change. Blocks shipping if data-safety
  or editor regression gates fail.
---

# Wings Ship Gate

**No exceptions.** User data loss destroyed trust once. Run this gate before every merge to `main` and every production deploy.

## Tier 0 — STOP if any fail (do not ship)

These caused or could cause **permanent user data loss**:

| # | Gate | Command / check |
|---|------|-----------------|
| 1 | Empty JSON must not beat markdown on load | `bun run test -- src/lib/editorContent.test.ts` |
| 2 | Empty autosave blocked | same test file (`shouldBlockEmptySave`) |
| 3 | Empty drafts blocked | same (`shouldApplyDraft`) |
| 4 | Empty pending replay blocked | same (`shouldReplayPendingWrite`) |
| 5 | Editor boots without crash | Open `/__editor-e2e` locally — `.ProseMirror` visible, no ErrorBoundary |
| 6 | Link registered once | `bun run test:editor` → `registers Link exactly once` |
| 7 | Suggestion keys distinct | `registers slash + page mention suggestion plugins with distinct keys` |
| 8 | WritingExperience priority 200 | `keeps the writing guard above StarterKit nodes but below Suggestion plugins` |

## Tier 1 — Required automated tests (CI must pass)

```bash
bun install --frozen-lockfile
bun run test:editor
bun run test:e2e
bun run build
```

All must exit 0. Do not skip E2E because "unit tests passed."

## Tier 2 — Manual smoke (5 minutes)

Run on **production build** or staging, not only dev:

1. **Load existing page** — content visible (not blank)
2. **Type a sentence** — refresh — sentence persists
3. **Enter** — new paragraph; **Shift+Enter** — line break in same block
4. **`/callout`** — slash menu → callout block appears
5. **Navigate away and back** — no content loss
6. **New incognito session** — login — pages still have content

If step 1 shows blank but Supabase has `content` → **STOP**, read **wings-data-safety** and run `bun run recover:entries`.

## Tier 3 — Database (before/after deploy)

```bash
bun run recover:entries          # dry run BEFORE deploy (baseline)
# deploy
bun run recover:entries          # dry run AFTER deploy — compare counts
```

Investigate any **new** rows in "Likely need PITR" or "Fixable" categories.

## Tier 4 — Change-type specific

### Touching `BlockEditor/**`, `editorExtensions`, `WritingExperience`, `SlashCommand`, `PageMention`

- Read **wings-block-editor** + [extension-checklist.md](../wings-block-editor/extension-checklist.md)
- Verify Vite `dedupe` includes any new `@tiptap/*` or `prosemirror-*` package
- Never merge without Playwright green

### Touching `Index.tsx`, `journal.ts`, `draftCache`, `editorContent`, `updateEntry`

- Read **wings-data-safety** + [incident-postmortem.md](../wings-data-safety/incident-postmortem.md)
- Add/update unit tests for every new save or load path
- Manually test: open page with content → hard refresh → content unchanged

### Touching `supabase/migrations/**`

- Read **wings-supabase**
- New migration only (never edit old)
- No `DELETE`, `TRUNCATE`, or `UPDATE entries SET content` without explicit user approval
- Test RLS as shared editor + owner on staging

### Touching `collab/**` or `VITE_COLLAB_URL`

- Read **wings-collab**
- Confirm empty Y.Doc seeding strategy
- Test shared page: both users see same content after reconnect

### Enabling new autosave / debounce / flush path

- Trace full path: editor → onChange → draft → debounce → `updateEntry`
- Every path must pass through `shouldBlockEmptySave` or equivalent
- Document in PR which paths were added

## Forbidden in PRs (reject without fix)

| Pattern | Why |
|---------|-----|
| `if (contentJson?.type === "doc") return contentJson` | Hides markdown behind empty JSON |
| `updateEntry(id, { content: "", ... })` without user intent | Wipes data |
| Default `SuggestionPluginKey` for multiple extensions | Editor crash |
| `StarterKit` without `link: false` | Duplicate Link |
| WritingExperience priority ≠ 200 | Enter/slash regression |
| Skipping E2E because CI is slow | jsdom cannot catch Enter/save bugs |
| `reuseExistingServer` false positive locally hiding stale bundle | Run `CI=1 E2E_PORT=8099 bun run test:e2e` |

## PR description template

```markdown
## Ship gate
- [ ] Tier 0 checks pass
- [ ] test:editor + test:e2e + build pass
- [ ] Manual smoke done (or N/A: docs-only)
- [ ] recover:entries dry run (before/after if deploy)
- [ ] Data paths touched: [list files or "none"]

## Data safety
- [ ] No new save path bypasses shouldBlockEmptySave
- [ ] No new load path bypasses resolveInitialEditorContent
```

## If gate fails in production

Follow **wings-incident-response** immediately. Do not iterate fixes on production without rollback plan.

## Related

- [decision-tree.md](decision-tree.md) — merge/deploy/rollback decisions
- [incident-postmortem.md](../wings-data-safety/incident-postmortem.md)
- [extension-checklist.md](../wings-block-editor/extension-checklist.md)
