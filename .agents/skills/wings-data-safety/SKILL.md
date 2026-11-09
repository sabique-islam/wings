---
name: wings-data-safety
description: >-
  Wings entry content persistence — mandatory rules for load, save, drafts, collab,
  and recovery. Use when changing ANY code that reads or writes entry content,
  including editor serialize, Index, journal.ts, draftCache, AI write tools, or import.
---

# Wings Data Safety

**User trust depends on this.** Read [incident-postmortem.md](incident-postmortem.md) before changing persistence.

## Golden rules

1. **Never write empty over non-empty** without explicit user delete action
2. **Never load empty JSON over non-empty markdown**
3. **Every save path goes through guards** — no bypass "just for collab/AI/import"
4. **Test load AND save** — load bugs become save bugs within seconds
5. **Run ship gate Tier 0** before merge

---

## Storage model

| Column | Written by | Read by |
|--------|------------|---------|
| `content` | `updateEntry`, import, AI tools | FTS, export, `resolveInitialEditorContent` fallback |
| `content_json` | `updateEntry` | `resolveInitialEditorContent` preferred if non-empty |
| `content_yjs` | Collab server only | Hocuspocus fetch |

Both `content` and `content_json` must stay **semantically in sync** on every intentional save.

---

## Load path (READ — fix here first when pages look blank)

**Single source of truth:** `resolveInitialEditorContent()` in `src/lib/editorContent.ts`

```
content_json non-empty doc?  → use JSON
else content markdown trim?  → markdownToHtml(content)
else empty JSON doc?         → use JSON (new page)
else                         → empty HTML
```

### isEmptyDoc — must match these cases

```ts
null / undefined                    → empty
{ type: "doc", content: [] }          → empty
{ type: "doc", content: [{ type: "paragraph" }] }  → empty
{ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] }  → NOT empty
```

### Forbidden load patterns

```ts
// ❌ NEVER — caused production incident
if (contentJson?.type === "doc") return contentJson;

// ❌ NEVER — treats "exists" as "has content"
if (contentJson) return contentJson;

// ✅ ALWAYS
return resolveInitialEditorContent(content, contentJson);
```

### Call sites (must all use resolver)

- `BlockEditor.tsx` → `resolveInitialContent` wrapper
- Any new editor entry point
- Import preview if added
- **NOT** SharedEntry (uses markdown only — OK)

---

## Save path (WRITE — fix here when DB gets wiped)

### Pipeline

```
TipTap doc
  → htmlToMarkdown(getHTML()) + getJSON()     [BlockEditor serialize, 200ms debounce]
  → onChange({ markdown, json })               [EditorChangePayload]
  → saveDraftThrottled                           [localStorage, 400ms]
  → Index handleChange debounce 1500ms
  → shouldBlockEmptySave(existing, next)        [GATE]
  → updateEntry(id, { content, content_json })  [Supabase]
```

### Guards (mandatory — do not remove)

| Function | Location | Blocks |
|----------|----------|--------|
| `shouldBlockEmptySave` | Index `handleChange` | Autosave empty over ≥20 chars |
| `shouldApplyDraft` | Index draft `useEffect` | Empty draft over server content |
| `shouldReplayPendingWrite` | Index pending replay | Empty offline queue over server |
| `isEmptyDoc` + resolver | BlockEditor load | Blank UI from empty JSON |

### When adding a NEW save path

Examples: AI replace, import merge, collab flush, bulk migration.

**Required steps:**

1. Fetch current server `content` (or use in-memory entry)
2. Call `shouldBlockEmptySave(serverContent, nextMarkdown)` — abort if true
3. Log blocked saves in dev: `console.warn('[wings] blocked empty save')`
4. Add unit test in `editorContent.test.ts`
5. Document path in [incident-postmortem.md](incident-postmortem.md) audit list

### updateEntry contract

```ts
// src/lib/journal.ts — always both fields together
.update({ content: payload.markdown, content_json: payload.json })
```

Never update only one field from client unless migration script with service role + review.

---

## Draft cache (`src/lib/draftCache.ts`)

| Key prefix | Purpose |
|------------|---------|
| `wings_draft_{id}` | Markdown |
| `wings_draft_json_{id}` | JSON string |
| `wings_pending_{id}` | Failed save queue |

### Rules

- Drafts are **cache**, not source of truth — server wins when draft would wipe
- Clear draft after successful `updateEntry`
- Pending replay runs **after** `fetchEntries` completes (needs server content for guard)
- Never queue pending write with empty payload from crashed editor

---

## Collab save split

When `entryShared && VITE_COLLAB_URL`:

- Live: Yjs → `content_yjs` (server)
- Solo autosave: **skipped** during session
- Disconnect: `nw:collab-flush` → `updateEntry` (must use same guards)

**Risk:** Empty Y.Doc replaces content. Seed Y.Doc from markdown before first collab session.

---

## AI & import paths

| Path | File | Must guard? |
|------|------|-------------|
| AI tool write/replace | `AIAssistant.tsx` | Yes — verify not writing empty |
| Import | `export.ts` → `createEntry` | Creates new rows — OK |
| Inline AI | `InlineAIMenu.tsx` | Uses editor commands — inherits serialize |

AI parity: `__nw_getMarkdown()` must match stored content (E2E enforced).

---

## Recovery

```bash
bun run recover:entries        # dry run — run before AND after deploy
bun run recover:entries:apply  # clears empty content_json where markdown exists
```

**PITR** for rows where both fields empty — see **wings-incident-response**.

---

## Required tests (add tests if you change this domain)

`src/lib/editorContent.test.ts`:

- [ ] `isEmptyDoc` edge cases
- [ ] `resolveInitialEditorContent` prefers markdown over empty JSON
- [ ] `resolveInitialEditorContent` prefers non-empty JSON over markdown
- [ ] `shouldBlockEmptySave`
- [ ] `shouldApplyDraft`
- [ ] `shouldReplayPendingWrite`

E2E `tests/editor-enter.spec.ts`:

- [ ] Parity: stored === preview === AI text after edits

---

## Pre-merge checklist (copy into PR)

```
[ ] Read incident-postmortem.md
[ ] No forbidden load patterns
[ ] Every new save path has shouldBlockEmptySave or equivalent
[ ] editorContent.test.ts updated and passing
[ ] recover:entries dry run shows no new regressions
[ ] Manual: open page with content → refresh → still there
[ ] Ship gate Tier 0 pass
```

---

## Related

- [code-paths.md](code-paths.md) — every load/save path with line refs
- [forbidden-patterns.md](forbidden-patterns.md) — patterns that caused the incident
- **wings-trust-recovery** — user communication after incidents
- **wings-ship-gate** — full deploy checklist
- **wings-incident-response** — active incident runbook
- **wings-block-editor** — serialize implementation
