# Docs · Wings

Product documentation for [Wings](https://wings.nopejs.me), a private notes app with lecture transcription, math, drawings, a local vault folder, and BYOK AI.

## Sign in

1. Go to [/auth](https://wings.nopejs.me/auth).
2. Use **Google** or enter your email for a **magic link**.
3. After PKCE callback at `/auth/callback`, you land in the app.

People sign in with Supabase (Google or magic link). See [auth.md](https://wings.nopejs.me/auth.md).

## API and MCP

A signed-in user can let an assistant read and write **their own** pages.

- MCP endpoint: `POST https://wings.nopejs.me/api/mcp`
- Headless clients send `Authorization: Bearer <personal access token>`
- Create the token in **Settings → Access**. It is shown once and starts with `wings_pat_`. Default scope is read. Write is a separate choice.
- ChatGPT and Claude use OAuth on that same URL. Wings publishes `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`. PKCE S256 is required. The consent screen shows the app name and whether it asked to write.
- Tools: `list_pages`, `get_page`, `search_pages`, `create_page`, `update_page`, `append_to_page`
- The same operations are HTTP routes under `/api/v1/pages` and `/api/v1/search`
- Local-vault bodies are not on the server. The API returns the title and a message instead of the body.
- The API does not return pages that belong to someone else, including pages they shared with you.
- Revoke a token or a connected app from Settings → Access.

### ChatGPT

1. Open ChatGPT settings and go to **Apps** or **Connectors** (Plugins → plus, or developer mode → custom connector, depending on the account).
2. Add a custom MCP server.
3. Name it Wings. URL: `https://wings.nopejs.me/api/mcp`. Authentication: **OAuth**.
4. Create it and finish the Wings consent screen while signed in. Leave write unchecked unless you want the connector to edit pages.
5. Invoke it with @Wings.

### Claude

1. Open **Settings → Connectors** (on a team, Organization settings → Connectors).
2. Add a custom connector and choose **Web**.
3. Name it Wings. Remote MCP URL: `https://wings.nopejs.me/api/mcp`.
4. Approve the Wings consent screen. Claude completes OAuth, including PKCE, itself.

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

## Lecture Mode

Open a page, then start Lecture Mode from **`/lecture`**, the command palette, or the mic button.

- Records the microphone and transcribes **on this device** with Whisper.
- First run downloads the model; later runs use the browser cache.
- Timestamped lines append to the **bottom** of the open page under `## Raw Transcript`.
- Does not create a new page. Does not overwrite existing notes.
- Transcription is approximate (classroom noise, accents, jargon).

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
| /lecture | Lecture mode |
| ⌘B / ⌘I / ⌘U / ⌘E | Bold / italic / underline / inline code |
| ⌘⇧S | Strikethrough |
| ⌘D | Duplicate block |
| ⌘⇧↑/↓ | Move block |
| Tab | Indent list |
| Esc | Select block |

## FAQ

### How do I sign in to Wings?

Open /auth and use Google OAuth or a magic link email. Auth is Supabase PKCE. Connected apps use a personal access token or OAuth from Settings → Access.

### How do I connect ChatGPT or Claude to my notes?

In ChatGPT, add a custom MCP connector with URL https://wings.nopejs.me/api/mcp and OAuth. In Claude, add a custom web connector with the same URL. Approve the Wings consent screen. Headless clients can instead send Authorization: Bearer and a personal access token from Settings → Access. The default scope is read-only. Local-vault page bodies are not on the server.

### What is Lecture Mode?

Open a page and start Lecture Mode from /lecture, the command palette, or the mic button. It records the microphone and transcribes on this device with Whisper. The first run downloads the model; later runs use the browser cache. Timestamped lines append to the bottom of the open page under Raw Transcript. It does not create a new page or overwrite existing notes. Transcription is approximate.

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
