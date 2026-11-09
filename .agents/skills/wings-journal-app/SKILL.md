---
name: wings-journal-app
description: >-
  Wings journal application shell — Index page, sidebar, entries CRUD, navigation,
  import/export, command palette, and offline drafts. Use when changing the main
  app UX outside BlockEditor internals.
---

# Wings Journal App

## Key files

```
src/pages/Index.tsx              Main app state, save debounce, navigation
src/components/JournalSidebar.tsx   Page tree, trash, search
src/components/JournalEditor.tsx    Header, title, BlockEditor wrapper
src/components/QuickSwitcher.tsx      Cmd+K quick open
src/components/CommandPalette.tsx   Commands
src/lib/journal.ts               fetchEntries, CRUD, search, trash
src/lib/export.ts                Import/export markdown & JSON
src/lib/draftCache.ts            Offline drafts + pending queue
src/lib/layout.ts                Entry layout map (Excalidraw positions)
```

## Index state flow

```
fetchEntries → entries + roleMap
activeId from route /app/n/:id or /:username/n/:id
activeEntry → JournalEditor
handleChange → draft throttle → debounced updateEntry (1500ms)
```

## Entry operations

| Action | Function |
|--------|----------|
| List | `fetchEntries(userId)` |
| Create | `createEntry(userId, content, parentId?)` |
| Save | `updateEntry(id, { markdown, json })` |
| Title | `updateEntryTitle` |
| Soft delete | `deleteEntry` → trash |
| Restore | `restoreEntry` |
| Search | `searchEntries` (FTS on `search_tsv`) |

## Navigation

- `setActiveId` updates route via `navigate(`${basePath}/n/${id}`)`
- Missing/deleted activeId → redirect home
- `nw:navigate` custom event for in-editor page links (`#page:uuid`)

## Keyboard shortcuts (Index)

| Shortcut | Action |
|----------|--------|
| Cmd+N | New page |
| Cmd+B | Toggle sidebar |
| Cmd+/ | Open search |
| Cmd+J | Toggle AI |

## Import / export

- Export: markdown or JSON via JournalEditor dropdown
- Import: `importFile()` in `export.ts` — `.md`, `.json`
- Bulk export: `exportAllEntries`

## Index save pipeline (detailed)

```
BlockEditor.onChange
  → handleChange (Index.tsx)
      1. pendingPayloadRef = payload
      2. saveDraftThrottled (localStorage, 400ms)
      3. if collab live → RETURN (no autosave)
      4. debounce 1500ms
      5. shouldBlockEmptySave(existing.content, markdown) → abort if true
      6. updateEntry → clearDraft → clearPendingWrite
      7. on failure → queuePendingWrite
```

### Other Index persistence hooks

| Hook | Trigger | Guard |
|------|---------|-------|
| Draft merge | `activeId` change | `shouldApplyDraft` |
| Pending replay | `user + entries` loaded | `shouldReplayPendingWrite` |
| Collab flush | `nw:collab-flush` | `shouldBlockEmptySave` |
| visibilitychange | tab hidden | draft only (no direct DB) |
| beforeunload | page close | draft only |

Full audit: **wings-data-safety/code-paths.md**

## Critical Index.tsx refs

- `SAVE_DEBOUNCE_MS = 1500` — changing this requires re-validating guards
- Pending replay deps **must** include `entries` (not just `user`)
- `entryShared` skips autosave — collab flush must still guard

## Dashboard

`DashboardHome` shown when no entry selected but entries exist.

## Related

- **wings-data-safety** — save pipeline
- **wings-auth-routing** — routes, basePath
- **wings-block-editor** — editor inside JournalEditor
