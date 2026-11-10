<div align="center">
    <img src="public/wings-logo.png" alt="Wings" width="100"/>
</div>

---

<div align="center">
    <h1>Wings</h1>
    <p>Notes with nested pages, LaTeX math, Excalidraw drawings, on-device lecture transcription, a local vault, and a BYOK AI panel.</p>
    <p>
        <a href="https://wings.nopejs.me"><img src="https://img.shields.io/website?url=https%3A%2F%2Fwings.nopejs.me&logo=vercel&logoColor=white&label=vercel" alt="Vercel deploy"/></a>
        <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React"/></a>
        <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white" alt="TypeScript"/></a>
        <a href="https://vitejs.dev"><img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite"/></a>
        <a href="https://supabase.com"><img src="https://img.shields.io/badge/Supabase-2-3FCF8E?logo=supabase&logoColor=white" alt="Supabase"/></a>
        <a href="https://tiptap.dev"><img src="https://img.shields.io/badge/TipTap-3-000" alt="TipTap"/></a>
        <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-000?logo=bun&logoColor=white" alt="Bun"/></a>
        <a href="https://github.com/Sabique-Islam/wings/blob/master/LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License: AGPL-3.0"/></a>
    </p>
    <p>
        <a href="https://wings.nopejs.me">Live</a>
        · <a href="https://discord.gg/vjGdgreZqp">Discord</a>
    </p>
</div>

---

<div align="center">
    <img src="history/assets/wings-hero.png" alt="Wings Banner" width="100%"/>
</div>

---

## Features

- Nested pages and a TipTap editor with slash commands
- Lecture Mode: record from the mic, transcribe on-device (Whisper), append a timestamped transcript to the open page. first run downloads the model; after that it stays cached in the browser
- LaTeX math and Excalidraw drawings in the same note
- BYOK AI panel (⌘J) with page context; keys stay in the browser
- Chat renders Mermaid diagrams with preview/source, expand, copy and download, using the editor's existing Markdown, math and code renderers.
- In notes, use `/mermaid` (or `/diagram`) to insert a rendered diagram, or paste a fenced `mermaid` block. The preview appears above its editable source, supports expansion, and also renders in shared read-only notes.
- Copying a rendered Mermaid SVG preserves it as a diagram image when editable source is absent; surrounding text, tables and annotated math stay together. For flattened ChatGPT copies, including Markdown-escaped CSS, Wings can rebuild a flowchart from an immediately preceding table's explicit **Edge** column when all copied node labels match. Rebuilt diagrams are labeled with their source; other source-less copies show a missing-diagram marker.
- Attach files by picking, pasting or dropping them into chat: images, PDFs, text/code, CSV, DOCX, PPTX, XLSX and OpenDocument text. Images and readable document text stay in the conversation for follow-up questions. Audio/video have local playback; other files have download cards.
- Chat attachments stay in memory for the current session. Up to 5 files, 25 MB each (images: 10 MB), 50 MB total per message. Text extraction is capped at 40,000 characters per file and 100 PDF pages, with partial/unreadable files labeled. Scanned PDFs need OCR; audio/video and unknown binaries are preview-only, and their contents are not sent to the AI.
- Public share links and email invites
- Local vault: new pages can keep bodies on device (connected folder) [or opt for cloud storage too :)]
- Account backup: zip download and folder import
- Markdown / JSON export and local draft cache
- Guards against empty overwrites of substantial notes
- Plugins and remote MCP access: search, read, create, and edit your pages from ChatGPT, Claude, or another MCP client

---

## History

![Notion workspace limit](history/assets/notion-limit.png)

i hit notion's limits in feb 2026. not on blocks (free tier gives you unlimited workspace blocks until you share), but shared workspace usage and the ai quota. needed more of both, so i threw this together on lovable.

friends liked it :) i still work on it occasionally, fixing bugs or adding features as requested or if i feel the lack of something.

migrated from lovable to a personal stack in july 2026.

---

## Plugins

Wings includes **Wings Notes**, a ChatGPT plugin for searching, reading, creating, and editing your own pages. The [plugin package](plugin/) contains its listing, icon, review cases, and remote MCP configuration. See the [packaging instructions](plugin/README.md) to build the ZIP. The package connects to the hosted Wings server; it does not need a local MCP process.

You can connect directly with the steps below without waiting for a public directory listing.

## Connect an MCP client

Use this remote MCP server URL (Streamable HTTP):

```text
https://wings.nopejs.me/api/mcp
```

### ChatGPT

1. Open ChatGPT on the web and go to **Plugins → + → Add custom MCP server**. Depending on your account, this may appear under **Settings → Apps → Advanced settings → Developer mode**.
2. Enter **Wings Notes** as the name and paste the server URL above.
3. Choose **OAuth**. If asked for a registration method, select **DCR** (dynamic client registration); no client ID or client secret is needed.
4. Review the connection notice, create and install the plugin, then sign in to Wings when prompted.
5. On the Wings consent screen, approve read access. Enable write access if you want ChatGPT to create or edit pages.
6. Select Wings Notes in a conversation and try: **“Which of my pages did I edit most recently?”**

Custom MCP availability depends on your ChatGPT account and workspace permissions. See [OpenAI's connection guide](https://developers.openai.com/api/docs/guides/custom-mcp-server).

### Claude

1. Open **Customize → Connectors → + Add → Add custom connector**. In some interfaces, connectors appear under **Settings → Connectors**; managed workspaces use **Organization settings → Connectors → Add → Custom → Web**.
2. Enter **Wings Notes** and the same server URL.
3. Use OAuth and choose **Register automatically** if asked how to identify the OAuth client. Connect and sign in to Wings. Approve read access, plus write access if you want to create or edit pages.
4. Enable the connector in your conversation and ask Claude to find or summarize a page.

On managed workspaces, an administrator may need to add or allow the connector first. See [Claude's custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

### Other MCP clients

For clients that accept a bearer token, create a personal access token in Wings under **Settings → Access**, then configure the same URL with this header:

```http
Authorization: Bearer <personal access token>
```

Tokens start with `wings_pat_` and default to read-only. Enable write access when creating a token if the client should create or edit pages. Keep the token in your client's private settings, not in a committed configuration file.

### Access and limits

- Tools: `list_pages`, `get_page`, `search_pages`, `create_page`, `update_page`, and `append_to_page`.
- Only pages you own are accessible; pages shared with you by other people are excluded.
- Local-vault bodies stay on your device and are not returned by the API.
- Pages with live collaboration history can be read but cannot be rewritten through the API. There is no delete tool.
- Revoke a token or connected app from **Settings → Access** in Wings.

The endpoint accepts **POST** requests. Opening it in a browser normally returns **“Method not allowed”**; that alone does not indicate a failed connection. More details: [Wings docs](https://wings.nopejs.me/docs.md).

For self-hosting, apply `supabase/migrations/20261020190000_api_access.sql` and set `API_TOKEN_PEPPER`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `API_PUBLIC_ORIGIN` to your deployment's HTTPS origin. Use that deployment's `/api/mcp` URL in your client. Those values stay out of git.

## Development

```sh
cp .env.example .env   # fill Supabase and related keys
npm install --legacy-peer-deps
npm run dev
```

CI and some scripts use [Bun](https://bun.sh) (`bun run test:ci`). Local day-to-day works with npm.

More setup: [.github/LOCAL_SETUP.md](.github/LOCAL_SETUP.md) · [CONTRIBUTING.md](.github/CONTRIBUTING.md)

---

## License

[GNU Affero General Public License v3.0 or later (AGPL-3.0)](https://github.com/Sabique-Islam/wings/blob/master/LICENSE). 

## Contributing

See [CONTRIBUTING.md](https://github.com/Sabique-Islam/wings/blob/master/.github/CONTRIBUTING.md).

---
