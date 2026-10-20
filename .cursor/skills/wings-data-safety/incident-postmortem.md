# Incident Postmortem — Empty content_json / autosave wipe (2026)

## Impact

Users saw blank pages. Trust lost. Some rows in Supabase had:
- Markdown still present but hidden (recoverable)
- Both `content` and `content_json` empty (needs PITR)

## Root cause chain (all required)

```
1. Notion parity added dual-write: content + content_json on every save
2. resolveInitialContent preferred ANY content_json doc over markdown
   → empty { type: "doc", content: [] } hid real markdown in UI
3. Editor could crash on load (duplicate suggestion$ plugin)
   → OR init empty doc → onUpdate serialized empty state
4. Autosave (1500ms debounce) + pending draft replay wrote empty to Supabase
5. No entry_versions snapshots wired — no undo
```

## Contributing factors

| Factor | Detail |
|--------|--------|
| Empty JSON priority | One line in BlockEditor — catastrophic |
| No empty-save guard | Index saved whatever editor emitted |
| Draft replay | Empty localStorage draft overwrote fetched content |
| Pending write queue | Replayed empty payload on login **before** fetch (fixed) |
| E2E not in merge gate initially | Crash shipped to production |
| entry_versions unused | Table exists, 0 rows |

## Fixes applied

| Fix | File |
|-----|------|
| `resolveInitialEditorContent` + `isEmptyDoc` | `src/lib/editorContent.ts` |
| `shouldBlockEmptySave` | Index handleChange |
| `shouldApplyDraft` | Index draft effect |
| `shouldReplayPendingWrite` | Index pending replay (after fetch) |
| Distinct suggestion PluginKeys | `suggestionPluginKeys.ts` |
| Collab flush guard | Index `nw:collab-flush` handler |
| Recovery script | `scripts/recover-entries.ts` |
| Ship gate skill | `.cursor/skills/wings-ship-gate/` |

## Lessons (non-negotiable going forward)

1. **Load path is as dangerous as save path** — wrong load → empty display → empty save
2. **Never ship editor changes without E2E** — unit tests do not catch Enter or mount crashes
3. **Empty is not a valid save** — treat empty-over-nonempty as a hard error
4. **Dual format needs explicit merge rules** — document in code + tests
5. **Recovery tooling before the incident** — `recover:entries` should exist before launch

## Code paths that touch user content (audit list)

```
LOAD:
  fetchEntries → Index state → JournalEditor → BlockEditor
  resolveInitialEditorContent(content, content_json)
  getDraft → shouldApplyDraft → merge into state

SAVE:
  BlockEditor onUpdate/onBlur → serialize → onChange
  saveDraftThrottled → localStorage
  Index debounce → shouldBlockEmptySave → updateEntry
  queuePendingWrite on failure
  pending replay → shouldReplayPendingWrite → updateEntry
  nw:collab-flush → updateEntry

EXTERNAL:
  AIAssistant tool:write/replace
  importFile
  SharedEntry read-only (no save)
  Personal API create/update/append (src/server/api/pages.ts) — service role, owner filter, shouldBlockEmptySave, writes content and empty content_json together so markdown wins on load. Local-vault body writes are refused.
```

Any new path must be added to this list and ship gate.

## Detection signals

| Signal | Meaning |
|--------|---------|
| `recover:entries` fixable count ↑ | JSON blocking markdown |
| Entries with `length(content)=0` and json empty ↑ | Active wipe |
| ErrorBoundary rate ↑ | Editor not mounting — no save OR crash loop |
| Support: "page blank but title there" | Classic empty JSON bug |
