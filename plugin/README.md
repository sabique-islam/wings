# Wings Notes: ChatGPT plugin package

This folder is the package uploaded to the OpenAI Plugins dashboard (Agent Plugins format). It is not part of the web app build.

```
plugin/
├── plugin.json   identity, listing, review cases, release notes
├── mcp.json      the one remote MCP server and its OAuth (DCR) settings
└── assets/icon.png
```

## Build the ZIP

Zip the contents of this folder, not the folder itself, so `plugin.json` sits at the ZIP root:

```bash
cd plugin && zip -r ../wings-notes-plugin.zip plugin.json mcp.json assets -x "*.DS_Store" && cd ..
```

Bump `version` in `plugin.json` and update `publication.release_notes` for every new upload. Changes to the MCP tools on the server do not need a new ZIP.

## Before the first upload

1. **Deploy the API.** Merge the personal API branch, apply `supabase/migrations/20261020190000_api_access.sql`, and set these on Vercel (Production only): `API_TOKEN_PEPPER`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `API_PUBLIC_ORIGIN=https://wings.nopejs.me`. Then check:
   - `https://wings.nopejs.me/.well-known/oauth-protected-resource` returns JSON
   - `POST https://wings.nopejs.me/api/mcp` without a token returns 401 with `WWW-Authenticate`
2. **Verify your developer identity** in the OpenAI organization settings.
3. **Domain verification.** When the portal shows the challenge token, save it, and nothing else, as `public/.well-known/openai-apps-challenge` and deploy. `vercel.json` already serves that path as `text/plain`.

## Before submitting for review

1. **Review account.** Create a dedicated user in the Supabase dashboard (Authentication → Users → Add user, with email and password, auto-confirmed). Reviewers sign in at `https://wings.nopejs.me/auth?method=password`. There is no MFA, magic link, or email code on this path. Enter the email and password only in the dashboard's **Review details** form, never in this folder.
2. **Sample data** in that account, used by the test cases in `plugin.json`:
   - **Launch plan**: headings `Goals`, `Decisions` (three or four bullet decisions), and `Action items`
   - **Reading list**, a few bullets
   - **Weekly review**, a short paragraph
   Run all five positive and three negative cases in ChatGPT, on desktop and on mobile, with that account.
3. **Demo video.** Record the eight cases, then add `"demo_recording_url": "<https link>"` under `extensions.com.openai.review` in `plugin.json`.
4. **Connect the MCP server** in the dashboard (MCPs → Connect), finish domain verification and OAuth with the review account, and resolve any scan findings.

## Notes

- **Auth placement.** OpenAI's packaging guide puts OAuth settings at `mcpServers.<name>.extensions["com.openai"].auth`. The portable schema at agent-plugins.org does not list `extensions` on a streamable-http server, so a generic schema validator flags that key. The OpenAI portal is the consumer, so this follows OpenAI's documented placement. If the upload rejects it, delete the `extensions` block: the server publishes OAuth discovery, including a registration endpoint, so DCR still works.
- **Scopes.** `baseScopes` asks for `read` and `write`. The Wings consent screen still lets the user untick write. Read-only connections get a clear error from write tools.
- **Tool annotations.** These live on the server (`src/server/api/mcp.ts`), not in this package.
