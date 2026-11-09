# auth.md

Agent authentication discovery for [Wings](https://wings.nopejs.me).

## Audience

People sign in to the Wings app with Google or a magic link. That account login is Supabase Auth. It is separate from the token an MCP client uses to read that person's own pages.

Wings does not register agent accounts and does not publish `/.well-known/openid-configuration`.

## How humans sign in

1. Open [https://wings.nopejs.me/auth](https://wings.nopejs.me/auth).
2. Choose **Google OAuth** or **magic link** (email OTP).
3. Complete the PKCE callback at `/auth/callback`.

## How an MCP client connects

Remote MCP (streamable HTTP): [https://wings.nopejs.me/api/mcp](https://wings.nopejs.me/api/mcp)

Two credentials work on that same endpoint:

| Credential | Who uses it | Header |
|------------|-------------|--------|
| Personal access token (`wings_pat_…`) | curl, Cursor, other headless clients | `Authorization: Bearer <personal access token>` |
| OAuth 2.1 access token (`wings_oat_…`) | ChatGPT custom connectors, Claude custom connectors | Obtained by the client. PKCE S256 is required. |

OAuth metadata:

- Protected resource: `/.well-known/oauth-protected-resource` (also path-inserted at `/.well-known/oauth-protected-resource/api/mcp`)
- Authorization server: `/.well-known/oauth-authorization-server`
- Dynamic client registration: `POST /api/oauth/register`
- Consent screen: `/oauth/authorize` (shows the client name and read vs write)
- Token endpoint: `POST /api/oauth/token` (form or JSON). Access tokens last one hour. Refresh tokens rotate and can be revoked.

A missing or rejected bearer token on `/api/mcp` returns 401 with `WWW-Authenticate` pointing at the protected resource metadata.

Create and revoke personal tokens, and revoke connected OAuth apps, in the app under Settings → Access. The plaintext token is shown once. Default scope is read. Write must be chosen explicitly. Tokens are stored only as hashes.

The API returns the token owner's pages only. A page stored in the local vault does not have its body on the server.

## Related discovery

- Product map for agents: [/llms.txt](https://wings.nopejs.me/llms.txt)
- API catalog: [/.well-known/api-catalog](https://wings.nopejs.me/.well-known/api-catalog)
- OpenAPI: [/openapi.json](https://wings.nopejs.me/openapi.json)
- Security contact: [/.well-known/security.txt](https://wings.nopejs.me/.well-known/security.txt)

## Still not published

MCP Server Card (SEP-1649), DNS-AID, A2A Agent Card, and commerce protocols (UCP, ACP) are not implemented. Those paths return 404.
