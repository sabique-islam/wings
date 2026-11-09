---
name: wings-incident-response
description: >-
  Runbook when Wings users report missing content, blank pages, or data loss.
  Use immediately on production incidents — stop bleeding first, recover second,
  communicate third.
---

# Wings Incident Response — Data Loss

## Phase 0 — First 15 minutes

1. **Stop the bleeding**
   - Roll back Vercel to last known-good deployment if editor/save code changed recently
   - Do NOT deploy "quick fixes" without ship gate (Tier 0)
   - Post status: "Investigating — do not delete pages or clear browser data"

2. **Confirm scope**
   ```bash
   bun run recover:entries
   ```
   Categories:
   - **Fixable** — markdown exists, JSON empty → app fix + `recover:entries:apply`
   - **JSON only** — content empty but JSON has nodes → deploy `resolveInitialEditorContent` fix
   - **Both empty** — need Supabase PITR

3. **Check Supabase directly** (service role, read-only first)
   ```sql
   SELECT id, title, length(content) AS md_len,
          content_json->'content' AS json_nodes, deleted_at
   FROM entries
   ORDER BY created_at DESC
   LIMIT 50;
   ```

## Phase 1 — Diagnose cause

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Blank editor, DB has markdown | Empty `content_json` won on load | Deploy editorContent fix + `recover:entries:apply` |
| ErrorBoundary "suggestion$" | Duplicate suggestion plugin | Deploy suggestionPluginKeys fix |
| All pages empty in DB | Mass empty autosave | PITR + deploy save guards |
| One user, one page | Bad local draft replay | Clear drafts; restore from DB |
| Shared page only | Collab empty Y.Doc | Disable VITE_COLLAB_URL until seeded |

See [incident-postmortem.md](../wings-data-safety/incident-postmortem.md) for July 2026 root cause.

## Phase 2 — Recovery actions

### A. Markdown survived (fixable)

```bash
bun run recover:entries:apply
```

Then deploy app with `resolveInitialEditorContent`. Users hard-refresh.

### B. JSON survived, markdown empty

Do NOT run recover script (clears JSON). Deploy app — editor should load JSON if non-empty.

Export sample:
```sql
SELECT content_json FROM entries WHERE id = '<uuid>';
```

### C. Both empty — point-in-time restore

1. Supabase Dashboard → Database → Backups
2. Restore to timestamp **before** bad deploy
3. Or selective table restore if on Pro plan
4. `entry_versions` likely empty — do not rely on it

### D. User local drafts

Ask affected users **not** to clear site data until DB restored. If needed:

```js
// User console — list drafts
Object.keys(localStorage).filter(k => k.includes('wings_draft'))
```

Support can guide export before clear.

## Phase 3 — Verification

After fix deploy:

```bash
bun run recover:entries
bun run test:ci
```

Manual: load 3 affected pages in incognito — content visible, edit persists after refresh.

## Phase 4 — Communication

Template for users:

> We identified an issue where the editor could save an empty state over existing content. We've [rolled back / deployed a fix] and [restored from backup / repaired affected pages]. Pages with content still in our database should display correctly after a hard refresh (Cmd+Shift+R). If a specific page is still empty, contact us with the page title and approximate last-edit date.

Do not blame users. Do not ask them to "just rewrite it" without recovery attempt.

## Phase 5 — Post-incident (within 48h)

- [ ] Add regression test for the specific failure mode
- [ ] Update **wings-data-safety** / ship gate if new path discovered
- [ ] Wire `entry_versions` on save if not already (future safety net)
- [ ] Consider feature flag for risky editor changes

## Escalation

| Situation | Action |
|-----------|--------|
| >10% entries both-empty | PITR immediately |
| Ongoing empty writes in logs | Rollback + disable autosave via flag |
| Cannot access Supabase backup | Contact Supabase support; preserve current DB snapshot |

## Related

- **wings-data-safety** — prevention
- **wings-ship-gate** — pre-deploy gates
