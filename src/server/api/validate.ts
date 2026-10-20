export type Scope = "read" | "write";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/;

export const LIMITS = {
  title: 100,
  name: 80,
  clientName: 120,
  content: 500_000,
  search: 200,
  state: 512,
  redirect: 500,
  jsonBody: 600_000,
  oauthBody: 32_768,
  tokenBody: 16_384,
  mcpBody: 600_000,
} as const;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function cleanName(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (cleaned.length < 1 || cleaned.length > max) return null;
  return cleaned;
}

export function normalizeTitle(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, LIMITS.title);
}

/** Unknown scopes are rejected. `write` always includes `read`. Omitted means read-only. */
export function scopesFromList(value: unknown, whenOmitted: Scope[] | null = ["read"]): Scope[] | null {
  if (value == null) return whenOmitted;
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) return null;
  const set = new Set<Scope>();
  for (const item of value) {
    if (item === "read") set.add("read");
    else if (item === "write") set.add("write");
    else return null;
  }
  if (set.has("write")) set.add("read");
  if (!set.has("read")) return null;
  return set.has("write") ? ["read", "write"] : ["read"];
}

export function scopesFromParam(value: unknown): Scope[] | null {
  if (value == null) return ["read"];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return ["read"];
  return scopesFromList(trimmed.split(/[\s+]+/).filter(Boolean), null);
}

export function hasScope(scopes: Scope[], needed: Scope): boolean {
  if (needed === "read") return scopes.includes("read") || scopes.includes("write");
  return scopes.includes("write");
}

export function cleanState(value: unknown): string | null {
  if (value == null || value === "") return "";
  if (typeof value !== "string") return null;
  if (value.length > LIMITS.state) return null;
  if (/[\u0000-\u001F\u007F]/.test(value)) return null;
  return value;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Exact redirect URIs only. https, or http on loopback. No fragments or userinfo. */
export function validateRedirectUri(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length < 8 || value.length > LIMITS.redirect) return null;
  if (/[\u0000-\u001F\u007F\\]/.test(value)) return null;
  if (value.includes("#") || value.includes("*")) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.hash) return null;
  if (url.protocol === "https:") return value;
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname)) return value;
  return null;
}

export function redirectHost(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export function validateCodeChallenge(method: unknown, challenge: unknown): string | null {
  if (method !== "S256") return null;
  if (typeof challenge !== "string" || !CHALLENGE_RE.test(challenge)) return null;
  return challenge;
}

export function validateVerifier(value: unknown): string | null {
  if (typeof value !== "string" || !VERIFIER_RE.test(value)) return null;
  return value;
}

export function canonicalResource(origin: string): string {
  return `${origin}/api/mcp`;
}

export function resourceMatches(value: unknown, origin: string): boolean {
  if (typeof value !== "string" || value.length > 300) return false;
  try {
    const url = new URL(value);
    if (url.hash || url.search || url.username || url.password) return false;
    const normalized = `${url.protocol.toLowerCase()}//${url.host}${url.pathname.replace(/\/+$/, "") || ""}`;
    return normalized === canonicalResource(origin);
  } catch {
    return false;
  }
}
