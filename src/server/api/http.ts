import { canonicalResource } from "./validate";

/** Server env only. Avoids a Node `process` type in the browser tsconfig. */
export function serverEnv(name: string): string {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name] ?? "";
}

const SECRET_KEYS = new Set([
  "authorization",
  "token",
  "access_token",
  "refresh_token",
  "code",
  "code_verifier",
  "secret",
  "secret_hash",
  "password",
  "pepper",
  "content",
  "markdown",
  "body",
  "note",
]);

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEYS.has(key.toLowerCase()) ? "[redacted]" : redact(item, depth + 1);
  }
  return out;
}

export function logLine(event: string, fields?: Record<string, unknown>): void {
  const payload = { event, ...(fields ? (redact(fields) as Record<string, unknown>) : {}) };
  console.log(JSON.stringify(payload));
}

export function wwwAuthenticate(origin: string, error?: "invalid_token" | "insufficient_scope"): string {
  const metadata = `${origin}/.well-known/oauth-protected-resource`;
  const parts = [`Bearer realm="wings"`, `resource_metadata="${metadata}"`];
  if (error) parts.push(`error="${error}"`);
  if (error === "insufficient_scope") parts.push(`scope="write"`);
  return parts.join(", ");
}

export function jsonResponse(
  status: number,
  body: unknown,
  extra?: Record<string, string>,
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export function emptyResponse(status: number, extra?: Record<string, string>): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  }
  return new Response(null, { status, headers });
}

export function unauthorized(origin: string): Response {
  return jsonResponse(401, { error: "Unauthorized" }, { "www-authenticate": wwwAuthenticate(origin, "invalid_token") });
}

export function forbidden(origin: string): Response {
  return jsonResponse(403, { error: "Forbidden" }, { "www-authenticate": wwwAuthenticate(origin, "insufficient_scope") });
}

export function tooMany(): Response {
  return jsonResponse(429, { error: "Too many requests" }, { "retry-after": "60" });
}

export async function readLimited(request: Request, max: number): Promise<{ ok: true; text: string } | { ok: false }> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > max) return { ok: false };
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(buf) };
}

export function parseBody(text: string, contentType: string | null): Record<string, unknown> | null {
  if (!text) return {};
  if (contentType?.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    const out: Record<string, unknown> = {};
    for (const [key, value] of params) out[key] = value;
    return out;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match?.[1] || match[1].length > 2000) return null;
  return match[1];
}

export function clientAddress(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last.slice(0, 128);
  }
  return "unknown";
}

export function sameSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

const PRODUCTION_ORIGIN = "https://wings.nopejs.me";

/** Browser Origin on the MCP/API resource. Missing Origin (curl, server-side clients) is allowed. */
export function resourceOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const host = parsed.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (parsed.origin === PRODUCTION_ORIGIN) return true;
  const extra = serverEnv("API_ALLOWED_ORIGINS").split(",").map((item) => item.trim()).filter(Boolean);
  return extra.includes(parsed.origin);
}

export function metadataDocument(origin: string, kind: "resource" | "server"): Record<string, unknown> {
  if (kind === "resource") {
    return {
      resource: canonicalResource(origin),
      authorization_servers: [origin],
      scopes_supported: ["read", "write"],
      bearer_methods_supported: ["header"],
      resource_documentation: `${origin}/docs.md`,
    };
  }
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["read", "write"],
    service_documentation: `${origin}/docs.md`,
  };
}

export function metadataResponse(origin: string, kind: "resource" | "server"): Response {
  return new Response(JSON.stringify(metadataDocument(origin, kind)), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}

export function isResourceMetadataPath(pathname: string): boolean {
  return pathname === "/.well-known/oauth-protected-resource"
    || pathname === "/.well-known/oauth-protected-resource/api/mcp";
}

export function isServerMetadataPath(pathname: string): boolean {
  return pathname === "/.well-known/oauth-authorization-server";
}
