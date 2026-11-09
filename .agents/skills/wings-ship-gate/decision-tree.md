# Ship Gate — Decision Tree

Use this when unsure whether to merge, deploy, or roll back.

```
                    ┌─────────────────────────┐
                    │  Touching editor/saves? │
                    └───────────┬─────────────┘
                          yes   │   no
                    ┌───────────▼─────────────┐
                    │  Run Tier 0 + test:ci   │
                    └───────────┬─────────────┘
                          fail  │  pass
              ┌─────────────────▼─────────────────┐
              │         DO NOT SHIP               │
              │  Fix → re-run gate → manual smoke │
              └───────────────────────────────────┘

                    ┌─────────────────────────┐
                    │ User reports blank page?  │
                    └───────────┬─────────────┘
                          yes   │
                    ┌───────────▼─────────────┐
                    │  STOP — incident mode   │
                    │  wings-incident-response│
                    └───────────┬─────────────┘
                                │
              ┌─────────────────▼─────────────────┐
              │ 1. Rollback if recent deploy      │
              │ 2. bun run recover:entries        │
              │ 3. Check Supabase (read-only)     │
              │ 4. Do NOT deploy "quick fix"      │
              │    without Tier 0 green           │
              └───────────────────────────────────┘

                    ┌─────────────────────────┐
                    │  recover:entries count ↑  │
                    │  after deploy?            │
                    └───────────┬─────────────┘
                          yes   │
                    ┌───────────▼─────────────┐
                    │  ROLLBACK IMMEDIATELY   │
                    │  New regression shipped │
                    └─────────────────────────┘

                    ┌─────────────────────────┐
                    │  Docs-only / CSS-only?  │
                    └───────────┬─────────────┘
                          yes   │
                    ┌───────────▼─────────────┐
                    │  build pass sufficient  │
                    │  (still run if unsure)  │
                    └─────────────────────────┘
```

## Quick reference: what tier applies?

| Change | Minimum gate |
|--------|--------------|
| `editorContent.ts`, Index save/load | Tier 0 + unit + E2E + recover dry run |
| New BlockEditor extension | Tier 0 + test:editor + test:e2e |
| `journal.ts` updateEntry | Tier 0 + code-paths audit |
| Supabase migration on `entries` | Tier 0 + staging RLS + user approval |
| Collab server | Tier 0 + shared page manual test |
| Sidebar CSS | build |
| README | none |

## Red flags during review (reject PR)

- [ ] New `updateEntry` call without guard
- [ ] Load logic not using `resolveInitialEditorContent`
- [ ] E2E skipped or "will fix later"
- [ ] Migration touches `content` / `content_json`
- [ ] Removed or weakened guard function
- [ ] Changed debounce timing without tracing full pipeline

## Post-deploy (always within 30 min)

```bash
bun run recover:entries
```

Compare fixable/lost counts to pre-deploy baseline. Any increase → rollback + incident.
