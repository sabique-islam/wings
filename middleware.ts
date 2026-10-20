import { next } from "@vercel/edge";
import { isResourceMetadataPath, isServerMetadataPath, metadataResponse } from "./src/server/api/http";

/** Well-known paths we intentionally do not publish (no soft-404 HTML). */
const NOT_APPLICABLE_PATHS = new Set([
  "/.well-known/openid-configuration",
  "/.well-known/mcp/server-card.json",
  "/.well-known/mcp/server-cards.json",
  "/.well-known/mcp.json",
  "/.well-known/agent-card.json",
  "/.well-known/ucp",
  "/.well-known/acp.json",
]);

/** Path → static markdown mirror under /public. */
const MARKDOWN_BY_PATH: Record<string, string> = {
  "/": "/index.md",
  "/pricing": "/pricing.md",
  "/docs": "/docs.md",
  "/about": "/about.md",
  "/blog": "/blog.md",
};

const BLOG_SLUG_RE = /^\/blog\/([a-z0-9-]+)$/;

function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const parts = accept.split(",").map((p) => p.trim().toLowerCase());
  let mdQ = -1;
  let htmlQ = -1;
  for (const part of parts) {
    const [type, ...params] = part.split(";").map((s) => s.trim());
    const qParam = params.find((p) => p.startsWith("q="));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (type === "text/markdown" || type === "text/x-markdown") mdQ = Math.max(mdQ, q);
    if (type === "text/html") htmlQ = Math.max(htmlQ, q);
  }
  if (mdQ < 0) return false;
  if (htmlQ < 0) return true;
  return mdQ >= htmlQ;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function markdownPathFor(pathname: string): string | null {
  if (MARKDOWN_BY_PATH[pathname]) return MARKDOWN_BY_PATH[pathname];
  const blog = pathname.match(BLOG_SLUG_RE);
  if (blog) return `/blog/${blog[1]}.md`;
  return null;
}

export const config = {
  matcher: [
    "/",
    "/pricing",
    "/docs",
    "/about",
    "/blog",
    "/blog/:slug*",
    "/.well-known/openid-configuration",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/api/mcp",
    "/.well-known/mcp/server-card.json",
    "/.well-known/mcp/server-cards.json",
    "/.well-known/mcp.json",
    "/.well-known/agent-card.json",
    "/.well-known/ucp",
    "/.well-known/acp.json",
  ],
};

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (NOT_APPLICABLE_PATHS.has(pathname)) {
    return new Response("Not Found\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  if ((request.method === "GET" || request.method === "HEAD") && isResourceMetadataPath(pathname)) {
    const metadata = metadataResponse(url.origin, "resource");
    if (request.method === "HEAD") return new Response(null, { status: 200, headers: metadata.headers });
    return metadata;
  }
  if ((request.method === "GET" || request.method === "HEAD") && isServerMetadataPath(pathname)) {
    const metadata = metadataResponse(url.origin, "server");
    if (request.method === "HEAD") return new Response(null, { status: 200, headers: metadata.headers });
    return metadata;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    if (prefersMarkdown(request.headers.get("accept"))) {
      const mdPath = markdownPathFor(pathname);
      if (mdPath) {
        const mdRes = await fetch(new URL(mdPath, url.origin));
        if (mdRes.ok) {
          const body = request.method === "HEAD" ? null : await mdRes.text();
          const headers = new Headers({
            "content-type": "text/markdown; charset=utf-8",
            "cache-control": "public, max-age=300",
          });
          if (body !== null) {
            headers.set("x-markdown-tokens", String(estimateTokens(body)));
          }
          return new Response(body, { status: 200, headers });
        }
      }
    }
  }

  return next();
}
