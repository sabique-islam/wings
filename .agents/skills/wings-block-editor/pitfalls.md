# Block Editor — Complete Pitfall Registry

Every item here caused or could cause production failure. Check before merge.

## 🔴 Tier 0 — Data loss or total editor failure

| ID | Pitfall | Symptom | Prevention | Test |
|----|---------|---------|------------|------|
| D1 | Empty `content_json` wins on load | Page blank, DB has markdown | `resolveInitialEditorContent` | editorContent.test |
| D2 | Empty autosave | DB content → "" | `shouldBlockEmptySave` | editorContent.test |
| D3 | Empty draft applied | UI blank → save | `shouldApplyDraft` | editorContent.test |
| D4 | Empty pending replay | Login wipes page | `shouldReplayPendingWrite` after fetch | editorContent.test |
| D5 | onChange on crash/empty init | Blank save after ErrorBoundary | BlockEditor returns null if !editor | E2E mount |
| D6 | Duplicate suggestion PluginKey | ErrorBoundary, no .ProseMirror | suggestionPluginKeys.ts | BlockEditor.test + E2E |
| D7 | Collab empty Y.Doc seed | Shared page cleared | Server fetch seeds from `content_json`/markdown | `collab/seedDocument.ts` + manual shared test |

## 🟠 Tier 1 — Editor broken (indirect data risk)

| ID | Pitfall | Symptom | Prevention | Test |
|----|---------|---------|------------|------|
| E1 | Duplicate StarterKit Link | Enter dead, no markdown | `link: false` | Link count test |
| E2 | WritingExperience priority 1000 | Enter during slash broken | priority 200 | priority test |
| E3 | Extensions not memoized | Random plugin errors | useMemo | E2E stability |
| E4 | Vite missing dedupe | PM type errors, weird plugins | vite.config dedupe | build |
| E5 | pluginKey before spread | Default key used | pluginKey last in Suggestion() | plugin key test |
| E6 | Page mention always on | suggestion$ collision | getPages conditional | E2E solo |
| E7 | Empty-list Backspace deletes `bulletList` wrapper | Pasted list vanishes when removing one item | `mergeEmptyBlockUp` skips list items / wrappers; ListKeymap lifts one item | BlockEditor.test + notion-parity |

## 🟡 Tier 2 — UX / test flakes

| ID | Pitfall | Symptom | Prevention | Test |
|----|---------|---------|------------|------|
| T1 | Cookie banner in E2E | Focus stolen | dismissCookieBanner | editor-helpers |
| T2 | Slash Enter in E2E | Block not inserted | Click menu button | notion-parity |
| T3 | Toggle selector ambiguous | Strict mode violation | Exact role name | notion-parity |
| T4 | ```ts trailing space | No code block | Enter after fence | editor-enter |
| T5 | TrailingNode empty p | Wrong p count | filter hasText | Cmd+D test |
| T6 | Stale dev server in E2E | Old bundle tested | CI=1 E2E_PORT=8099 | CI |
| T7 | Headless ArrowLeft | Caret wrong | setTextSelection | editor-enter |

## Code smell search (run before merge)

```bash
# Forbidden patterns — investigate any hit
rg "contentJson\?\.type === \"doc\"" src/
rg "pluginKey: new PluginKey\(\"suggestion\"\)" src/
rg "link: true" src/components/BlockEditor/editorExtensions.ts
rg "priority: 1000" src/components/BlockEditor/WritingExperienceExtension.ts
rg "createBlockEditorExtensions\(\{" src/components/BlockEditor/BlockEditor.tsx  # should be useMemo
```

## When adding new pitfall

1. Add row to this table
2. Add regression test
3. Add ship gate Tier 0/1 if applicable
4. Update **wings-ship-gate**
