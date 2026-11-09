# Forbidden Patterns — Data Safety

**If you write or review any of these, stop the PR.**

---

## Load — never do this

### Prefer JSON because it "exists"

```ts
// ❌ CAUSED PRODUCTION DATA LOSS
if (contentJson?.type === "doc") return contentJson;

// ❌ Same bug, different shape
if (contentJson) return contentJson;

// ❌ Inline duplicate of bad logic
const initial = contentJson ?? markdownToHtml(content);
```

```ts
// ✅ ONLY allowed pattern
return resolveInitialEditorContent(content, contentJson);
```

### Skip isEmptyDoc check

```ts
// ❌ Empty doc is still a "doc"
if (contentJson.type === "doc" && contentJson.content?.length === 0) {
  return contentJson; // hides markdown
}
```

Use `isEmptyDoc()` — it also catches single empty paragraph.

---

## Save — never do this

### Direct empty write

```ts
// ❌
await updateEntry(id, { markdown: "", json: { type: "doc", content: [] } });

// ❌ Bypass guard "just this once"
await supabase.from("entries").update({ content: "", content_json: null }).eq("id", id);
```

Empty save is only valid when user explicitly deletes all content AND existing content is already empty or user confirmed.

### New save path without guard

```ts
// ❌ New feature writes without shouldBlockEmptySave
async function syncFromSomewhere() {
  await updateEntry(id, payload);
}
```

Every path to `updateEntry` must pass through a guard or be creating a new row.

### onChange on mount with empty editor

```ts
// ❌ Editor mounts empty, immediately serializes, wipes DB
useEditor({
  onUpdate: ({ editor }) => onChange(serialize(editor)), // fires on mount
});
```

BlockEditor must not emit empty over loaded content on first paint. Use version refs + `emitUpdate: false` on programmatic setContent.

### Pending replay before fetch

```ts
// ❌ serverContent always "" because entries not loaded
useEffect(() => {
  replayPendingWrites();
}, [user]); // missing entries dependency
```

Dependency array **must** include `entries`.

---

## Drafts — never do this

```ts
// ❌ Apply draft unconditionally
if (draft) setEntry({ ...entry, content: draft.markdown });

// ❌ Clear server content when draft is empty
return { ...e, content: draft.markdown ?? "" };
```

Use `shouldApplyDraft(existingContent, draftMarkdown)`.

---

## Migrations — never do this without explicit approval

```sql
DELETE FROM entries;
TRUNCATE entries;
UPDATE entries SET content = '', content_json = NULL;
```

Content migrations must be additive or copy-forward, never mass wipe.

---

## Collab — never do this

```ts
// ❌ Seed empty Y.Doc on connect
const ydoc = new Y.Doc(); // no seed from markdown

// ❌ Flush without guard
await updateEntry(id, toSave); // on collab disconnect
```

---

## Review grep (run on every persistence PR)

```bash
rg "contentJson\?\.type === \"doc\"" src/
rg "updateEntry\(" src/ --glob '!**/journal.ts'
rg "from\(\"entries\"\)\.update" src/
rg "shouldBlockEmptySave" src/pages/Index.tsx  # verify all save paths nearby
```

Every `updateEntry` in Index.tsx must have `shouldBlockEmptySave` or `shouldReplayPendingWrite` within ~15 lines above it.
