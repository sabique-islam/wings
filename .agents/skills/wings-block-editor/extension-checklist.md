# Block Editor — Extension Change Checklist

Copy this checklist into PR when touching `src/components/BlockEditor/**`.

## Before coding

- [ ] Read **wings-data-safety** if change affects serialize, load, or onChange timing
- [ ] Read [pitfalls.md](pitfalls.md)
- [ ] Identify extension priority — will it conflict with 200 or 500?

## Implementation checklist

### New extension

- [ ] `Extension.create` / `Node.create` with unique `name`
- [ ] Registered in `editorExtensions.ts` (correct position in array)
- [ ] Added to `UniqueID.configure({ types: [...] })` if top-level block
- [ ] Turndown rule in `src/lib/markdown.ts` if custom HTML
- [ ] Slash item in `SlashCommandExtension.tsx` if user-insertable
- [ ] `turnInto` in `blockCommands.ts` if convertible block type
- [ ] CSS in `src/index.css` if visual block

### New keyboard shortcut

- [ ] Priority documented (100 / 200 / 500)
- [ ] Does not fire when suggestion menu active (if Enter/Tab)
- [ ] Vitest for command existence OR Playwright for behavior

### New Suggestion menu (@ or /)

- [ ] Import key from `suggestionPluginKeys.ts` — **create new key if new menu**
- [ ] `pluginKey` passed **after** `...this.options.suggestion` spread
- [ ] Conditional registration if not always needed (like page mentions)
- [ ] Vitest: plugin key registered, distinct from other suggestion plugins

### React / useEditor

- [ ] Extensions in `useMemo` — stable reference
- [ ] `useEditor(..., [collabSession])` — minimal deps
- [ ] `key={entry.id}` on BlockEditor preserved
- [ ] `shouldRerenderOnTransaction: false` unchanged unless justified

### NodeView (React)

- [ ] TipTap v3: `NodeViewContent as="div"` only (not `"code"`)
- [ ] E2E selector documented if non-standard DOM

## After coding — mandatory verification

```bash
bun run test:editor
bun run test:e2e
```

Manual:

1. `/__editor-e2e` loads — no ErrorBoundary
2. Type, Enter, slash command, refresh — content persists
3. If touched suggestion: both `/` and `@` (with pages) work without crash

## Forbidden (reject in review)

| Change | Reason |
|--------|--------|
| `StarterKit` without `link: false` | Duplicate Link |
| `WritingExperience` priority ≠ 200 | Slash/Enter regression |
| `new PluginKey("suggestion")` or default suggestion key × 2 | Crash |
| Extensions array inline in useEditor without useMemo | Plugin duplication |
| `onChange` on mount with empty before load resolves | Data wipe |
| Remove vite dedupe for prosemirror/tiptap | Type/plugin chaos |

## Regression test references

| Test | File | Asserts |
|------|------|---------|
| Link once | BlockEditor.test.ts | `registers Link exactly once` |
| Priority 200 | BlockEditor.test.ts | writing guard priority |
| Suggestion keys | BlockEditor.test.ts | distinct plugin keys |
| Slash active | BlockEditor.test.ts | `/callout` activates suggestion |
| Enter parity | editor-enter.spec.ts | paragraphs, markdown, code block |
| Notion keys | editor-notion-parity.spec.ts | backspace, slash, Cmd+D, Esc |

## If editor crashes on load

1. Check ErrorBoundary message for `suggestion$` → plugin key collision
2. Check for duplicate Link in `editor.extensionManager.extensions`
3. Check browser console for ProseMirror plugin errors
4. Run with fresh Vite: `CI=1 E2E_PORT=8099 bun run test:e2e`
5. **Do not ship** until `.ProseMirror` visible in E2E
