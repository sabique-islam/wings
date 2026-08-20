---
name: wings-export
description: Explain how Wings users export notes, keep a local vault folder, and keep drafts offline. Use when asked about data portability, markdown export, local vault, or draft cache.
---

# Wings export and drafts

## Export

From the signed-in app, users can export a page as:

- **Markdown** — portable text for other editors
- **JSON** — structured document dump

There is no bulk third-party export API. Export is a first-party UI action.

## Local vault

Connect a folder on this device (Chrome or Edge). New pages can be Always local, Always cloud, or Ask each time.

- Local page bodies stay on disk as markdown. Wings stores the title so the sidebar still works.
- Shared and collab pages are always cloud.
- Account backup can download a zip of every page in the same vault layout.

## Draft cache

- Recent edits cache in the browser when sync is unavailable
- Empty content is not allowed to overwrite substantial server content
- Clearing site data clears local drafts

## Privacy

Do not crawl or index `/s/` share URLs or `/app` / `/:username` journal routes. See robots.txt and auth.md.
