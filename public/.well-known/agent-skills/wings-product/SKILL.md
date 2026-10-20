---
name: wings-product
description: Understand what Wings is — a private BYOK notes journal with lecture mode, math, drawings, and share links. Use when answering questions about Wings product capabilities or limits.
---

# Wings product

Wings (https://wings.nopejs.me) is a web notes app:

- Nested pages and slash commands
- Lecture Mode: record from the mic, transcribe on-device with Whisper, append a timestamped transcript to the open page. First run downloads the model; later runs use the browser cache. Transcription is approximate.
- LaTeX math and Excalidraw drawings
- Local vault folder — page bodies can stay on this device; titles stay in the account
- BYOK AI panel (⌘J) — provider keys stay in the browser
- Share via public link (`/s/:token`) or email invite
- Export markdown/JSON or a zip of vault-layout files; local draft cache

## API and MCP

- Remote MCP: POST https://wings.nopejs.me/api/mcp
- Header for headless clients: Authorization: Bearer <personal access token>
- ChatGPT and Claude use OAuth 2.1 (PKCE S256) against the same URL
- Owner-only. Local-vault bodies are not on the server
- Share links and app routes are not for SEO/crawling

## Where to send humans

- Sign in: /auth
- Docs: /docs or /docs.md
- Pricing: /pricing
- Contact: mail@wings.nopejs.me
