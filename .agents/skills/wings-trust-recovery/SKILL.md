---
name: wings-trust-recovery
description: >-
  Rebuilding user trust after data incidents — communication templates, recovery
  verification, prevention commitments, and support workflows. Use when users
  report lost content, after deploys touching editor/saves, or when planning
  user-facing incident response.
---

# Wings Trust Recovery

Users lost content once. **Technical fixes alone do not restore trust.** This skill covers what to say, what to do, and what to prove.

---

## Principles

1. **Assume the data still exists** until proven otherwise (markdown, JSON, PITR, local drafts)
2. **Never blame the user** (browser cache, "you must have deleted it")
3. **Never ask users to rewrite** without attempting recovery first
4. **Be specific** about scope, fix status, and what they should do
5. **Under-promise, over-deliver** on recovery

---

## Immediate response (first message to affected user)

```
Hi [name],

Thank you for reporting this — I'm sorry your page content disappeared. That should never happen.

We're treating this as urgent. Here's what we're doing right now:

1. Checking our database for your page "[title]" — content is often still stored even when the editor shows blank
2. [Deployed a fix / Rolling back] to stop any further issues
3. Will follow up within [timeframe] with what we recovered

Please do NOT clear browser data or delete the page — that can remove local recovery options.

If you remember the approximate last edit date or can share the page URL/title, that helps us locate the right backup.

— [name]
```

---

## After technical recovery

### If content restored from DB

```
Good news: we found your content for "[title]" in our database and restored it.

Please hard-refresh the page (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows) and confirm you see your notes again.

If anything still looks wrong — missing sections, formatting off — reply with details and we'll keep digging.

We've added safeguards so empty saves can't overwrite existing content again, and we're running automated checks before every deploy.
```

### If partial recovery (markdown only, formatting lost)

```
We recovered the text of "[title]" from our backup. Some block formatting (callouts, toggles, etc.) may need minor cleanup, but your words are back.

Hard-refresh and let us know if anything is still missing.
```

### If PITR / backup required

```
Your page "[title]" was affected by a bug that wrote empty content to our database. We're restoring from a point-in-time backup taken before the incident.

You don't need to do anything — we'll email when restore is complete. Do not edit that page until we confirm.

We expect this completed by [time].
```

### If unrecoverable (both DB fields empty, no PITR)

```
I've exhausted our recovery options for "[title]" — the database row no longer contains the text, and we don't have a backup snapshot from before the loss.

I'm deeply sorry. [Offer credit / extended support / export assistance if they have local drafts]

To check for a local copy: open DevTools → Application → Local Storage → look for keys starting with wings_draft_
```

---

## Internal verification before telling users "fixed"

Run this checklist — **all must pass**:

```bash
bun run recover:entries          # zero new fixable/lost vs baseline
bun run test:ci                  # green
```

Manual (incognito, production):

- [ ] Open 3 previously-affected pages — content visible
- [ ] Edit one sentence — hard refresh — sentence persists
- [ ] New page — type — refresh — persists
- [ ] Log out / log in — content still there

Only then send "fixed" messages.

---

## Public status page / changelog (optional)

Keep it factual:

> **Resolved — Editor content display (Jul 2026)**
>
> Some users saw blank pages while content remained in our database. Root cause: the editor preferred an empty snapshot over saved text. We've fixed load/save logic, added automated guards, and repaired affected rows where possible. If your page is still empty after a hard refresh, contact support@…

Do not minimize ("minor glitch").

---

## Prevention commitments (safe to share)

These are **true** after the 2026 fixes:

- Empty content cannot autosave over pages with substantial existing text
- Empty local drafts cannot overwrite server content on page open
- Editor must boot without crash before we ship (automated E2E)
- We run a database scan script before/after deploys

Do **not** promise until implemented:

- Version history on every save (`entry_versions` not wired yet)
- Real-time collab without extra testing

---

## Support data to collect

| Field | Why |
|-------|-----|
| Page title | Find row in Supabase |
| Page URL / UUID | Exact row |
| Approx last good edit date | PITR timestamp |
| Screenshot of blank editor | Confirm symptom |
| Browser / OS | Reproduce |
| Did they clear site data? | Draft recovery possible? |

---

## Escalation matrix

| Situation | Action |
|-----------|--------|
| 1 user, fixable row | `recover:entries:apply` + deploy + personal email |
| Multiple users, fixable | Deploy + status message + proactive scan all users |
| Both fields empty | PITR immediately, pause deploys |
| Ongoing reports after fix | Rollback, re-run recover script, incident response |

---

## Related

- **wings-incident-response** — technical runbook
- **wings-data-safety** — prevention
- **wings-ship-gate** — pre-deploy gates
