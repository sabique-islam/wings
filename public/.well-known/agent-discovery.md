# Agent discovery status for Wings

Honest inventory of discovery standards on `wings.nopejs.me`.

## Published

- Link headers on `/` (RFC 8288)
- Content Signals in `/robots.txt`
- `/.well-known/api-catalog` (RFC 9727) — personal API and MCP
- `/openapi.json` — personal pages API and MCP
- `/auth.md` — human sign-in via Supabase, plus PAT and MCP OAuth for the caller's own pages
- `/.well-known/oauth-protected-resource` (RFC 9728), including the path-inserted MCP URL
- `/.well-known/oauth-authorization-server` (RFC 8414) — PKCE S256, dynamic client registration
- Remote MCP: `POST /api/mcp` (streamable HTTP)
- `/.well-known/agent-skills/index.json` + product skills
- `/llms.txt`, `/llms-full.txt`, markdown mirrors + `Accept: text/markdown` negotiation (Vercel Edge middleware)
- WebMCP tools on the marketing homepage
- `/.well-known/security.txt`

## Deferred (do not fabricate)

These will ship only when real endpoints exist:

- DNS-AID (`_agents` SVCB/HTTPS + DNSSEC)
- `/.well-known/openid-configuration` (human login is Supabase, not a Wings OpenID provider)
- MCP Server Card (SEP-1649)
- A2A Agent Card
- Commerce protocols (x402, UCP, ACP, AP2)

Missing deferred paths return **404**, not soft-404 HTML.
