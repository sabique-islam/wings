---
name: wings-block-editor
description: >-
  Wings TipTap BlockEditor — extensions, keyboard priority, suggestion plugins,
  serialize pipeline, and mandatory verification. Use for ANY change under
  BlockEditor/, editor keyboard behavior, slash/@ menus, or markdown round-trip.
---

# Wings Block Editor

**An editor crash or empty init can wipe user data.** Always pair editor changes with **wings-data-safety** and **wings-ship-gate**.

## Architecture

```
JournalEditor
  └── BlockEditor (key=entry.id)
        ├── createBlockEditorExtensions() [memoized]
        ├── resolveInitialEditorContent(content, content_json)
        ├── serialize → onChange({ markdown, json })
        └── collabSession? → Collaboration extensions
```

| File | Responsibility |
|------|----------------|
| `BlockEditor.tsx` | useEditor, paste, drop, serialize debounce, globals |
| `editorExtensions.ts` | Extension factory — **order matters** |
| `WritingExperienceExtension.ts` | Enter/Backspace/Tab (priority **200**) |
| `SlashCommandExtension.tsx` | `/` menu |
| `PageMentionExtension.tsx` | `@` menu (conditional) |
| `suggestionPluginKeys.ts` | **Only** place to create suggestion PluginKeys |
| `markdown.ts` | HTML ↔ markdown |
| `editorContent.ts` | Load resolution (data safety) |

---

## Extension priority ladder

```
Priority 500  @tiptap/suggestion (slash, @)     ← captures Enter when menu open
Priority 200  WritingExperience               ← Notion Enter/Backspace/Tab
Priority 100  StarterKit node keymaps           ← default split/enter
```

**Never set WritingExperience to 1000** — Enter bypasses slash menu (regression shipped once).

When adding keymap at priority 200–400, test slash menu Enter explicitly in Playwright.

---

## StarterKit configuration (immutable)

```ts
StarterKit.configure({
  heading: { levels: [1, 2, 3] },
  codeBlock: false,      // CodeBlockExtension replaces
  dropcursor: false,     // explicit Dropcursor
  link: false,           // CRITICAL — explicit Link below
  ...(collab ? { undoRedo: false } : {}),
}),
// ...
Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
// Link.extend({ inclusive: false }) — typing after a pasted URL is plain text
```

**Test:** `registers Link exactly once` — run on every BlockEditor PR.

---

## Suggestion plugins

### Rules

1. One `PluginKey` per suggestion menu — defined in `suggestionPluginKeys.ts`
2. Never import default `SuggestionPluginKey` from `@tiptap/suggestion` for app menus
3. Register page mentions **only** when `getPages` defined (`pages.length > 0`)
4. Vite dedupe must include `@tiptap/suggestion`

### Correct pattern

```ts
import { slashCommandSuggestionKey } from "./suggestionPluginKeys";

addProseMirrorPlugins() {
  return [
    Suggestion({
      editor: this.editor,
      ...this.options.suggestion,
      pluginKey: slashCommandSuggestionKey,  // AFTER spread
    }),
  ];
},
```

### Crash signature

```
Adding different instances of a keyed plugin (suggestion$)
```

→ duplicate keys or duplicate module instances. Fix keys first, then dedupe.

---

## Serialize pipeline (ties to data safety)

```
onUpdate / onBlur
  → htmlToMarkdown(editor.getHTML())
  → editor.getJSON()
  → debounce 200ms
  → onChange({ markdown, json })
```

**Rules:**

- Do not call `onChange` on mount with empty if props had content
- `lastEmittedMarkdown` / version refs prevent echo loops — preserve when editing sync logic
- `emitUpdate: false` on programmatic setContent from props

### Window globals (do not remove without migration)

| Global | Consumer |
|--------|----------|
| `__nw_editor` | AI, E2E, image insert, page links |
| `__nw_getMarkdown` | AI parity |
| `__nw_flushEditor` | unload / route change |
| `__nw_insertImage` | paste / upload |
| `__nw_currentMarkdown` | debug |

---

## useEditor React contract

```ts
const extensions = useMemo(
  () => createBlockEditorExtensions({ ...handlers }),
  [collabSession, pages.length, /* stable handler refs */],
);

const editor = useEditor({ extensions, ... }, [collabSession]);
```

**Failure mode:** inline `createBlockEditorExtensions()` every render → plugin re-registration → crash or duplicate plugins.

---

## Adding a new block type

See [extension-checklist.md](extension-checklist.md) for full checklist.

Minimum:

1. Extension file with schema + commands
2. `editorExtensions.ts` registration
3. Turndown rule if not standard HTML
4. Vitest: `editor.state.schema.nodes.yourBlock` exists
5. Playwright if keyboard-created

---

## Markdown round-trip

Custom blocks need Turndown rules in `markdown.ts`. Verify:

```bash
bun run test -- src/lib/markdown.test.ts
```

E2E parity test ensures markdown → editor → markdown stable for common blocks.

---

## ProseMirror type duplication

Nested `prosemirror-model` paths cause TS errors. Pattern:

- Structural interfaces in `blockUtils.ts`
- Cast at `Fragment.from` boundary
- Do not import `Node`/`Fragment` from two package paths in same file

---

## Testing requirements

| Behavior | Vitest | Playwright |
|----------|--------|------------|
| Extension registered | ✓ | — |
| Link count, priority | ✓ | — |
| Suggestion plugin keys | ✓ | — |
| Enter splits paragraph | ✗ jsdom | ✓ |
| Shift+Enter hard break | partial | ✓ |
| Slash inserts block | ✗ | ✓ (click menu item) |
| Code fence ``` | ✗ | ✓ |
| Editor mounts | ✗ | ✓ `.ProseMirror` visible |

**Never merge editor PR without Playwright green.**

---

## E2E harness

- Route: `/__editor-e2e` (DEV only)
- Helpers: `tests/editor-helpers.ts` — dismiss cookies, focus editor
- Fresh server: `CI=1 E2E_PORT=8099 bun run test:e2e`

---

## Full pitfall list

[pitfalls.md](pitfalls.md) | [extension-checklist.md](extension-checklist.md)

## Related

- **wings-data-safety** — load/save guards
- **wings-ship-gate** — Tier 0 gates
- **wings-testing** — CI details
