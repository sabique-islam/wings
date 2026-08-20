# Docs · Wings

Product documentation for [Wings](https://wings.nopejs.me), a private notes app with a block editor, math, drawings, a local vault folder, and BYOK AI.

## Sign in

1. Go to [/auth](https://wings.nopejs.me/auth).
2. Use **Google** or enter your email for a **magic link**.
3. After PKCE callback at `/auth/callback`, you land in the app.

Auth is powered by Supabase. There is no third-party API key for Wings itself. See [auth.md](https://wings.nopejs.me/auth.md).

## Local vault

Connect a folder on this device (**Chrome or Edge**). New pages can be **Always local**, **Always cloud**, or **Ask each time**.

- **Always local:** the page body stays on disk as markdown. Wings stores the title so the sidebar still works. Not shareable.
- **Always cloud:** shareable and synced across devices.
- Shared and collab pages are always cloud — collaborators never own a local vault body.

## Sharing

- **Public link** (`/s/:token`): anyone with the link can view (and edit if granted). These URLs are `noindex` and disallowed in robots.txt. Do not treat them as marketing content.
- **Email invite**: share with a specific address and role (viewer / editor / admin).

## Export and drafts

- Export a page as **markdown** or **JSON** from the app.
- Download a **zip** of every page in vault-layout markdown.
- Offline **draft cache** keeps recent edits in the browser if the network drops.
- Empty saves are blocked when the server already has substantial content.

## AI (BYOK)

- Open the AI panel with **⌘J** (Ctrl+J).
- Configure your own provider keys in the browser.
- Keys are stored locally; prompts go to the provider you chose.

## Keyboard shortcuts

Press **⌘?** (Ctrl+?) in the app for the full list.

### Navigation

| Shortcut | Action |
|----------|--------|
| ⌘K | Command palette |
| ⌘N | New page |
| ⌘P | Quick switcher |
| ⌘B | Toggle sidebar |
| ⌘/ | Search sidebar |
| ⌘J | AI panel |

### Editing

| Shortcut | Action |
|----------|--------|
| / | Slash commands (line start) |
| ⌘B / ⌘I / ⌘U / ⌘E | Bold / italic / underline / inline code |
| ⌘⇧S | Strikethrough |
| ⌘D | Duplicate block |
| ⌘⇧↑/↓ | Move block |
| Tab | Indent list |
| Esc | Select block |

## FAQ

### How do I sign in to Wings?

Open /auth and use Google OAuth or a magic link email. Auth is Supabase PKCE. There is no third-party Wings API key.

### What is BYOK AI?

Bring-your-own-key. You configure a provider key in the browser. Keys stay local. Prompts go to the provider you choose when you open the AI panel with Cmd+J.

### What is the local vault?

Connect a folder on this device in Chrome or Edge. New pages can be Always local, Always cloud, or Ask each time. Local page bodies stay on disk as markdown; Wings stores the title so the sidebar still works. Shared and collab pages are always cloud.

### Are shared notes indexed by search engines?

No. Share links under /s/ are disallowed in robots.txt and marked noindex. They are for people you invite, not for SEO.

### How do I export my notes?

Export a page as markdown or JSON from the signed-in app, or download a zip of every page in vault layout. Drafts also cache locally when sync is unavailable.

### Is Wings free?

Yes for features that ship today. Paid plans for hosted AI credits are planned and not live yet.

### Is Wings open source?

Yes. Wings is licensed AGPL-3.0-or-later. Source is on GitHub at Sabique-Islam/wings.

### What happens if an empty save races a real note?

Wings blocks empty or near-empty saves from overwriting substantial server content, and empty drafts cannot replace non-empty server notes on reload.

## Support

Email [mail@wings.nopejs.me](mailto:mail@wings.nopejs.me) or see [/support](https://wings.nopejs.me/support).
