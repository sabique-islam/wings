import { issueToken, parseToken, secretMatches } from "./crypto";
import type { ApiDeps, PatRow, Principal } from "./types";
import { cleanName, hasScope, LIMITS, scopesFromList } from "./validate";

const TWO_YEARS_MS = 2 * 366 * 24 * 60 * 60 * 1000;

function expired(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() <= now.getTime();
}

export async function resolvePrincipal(deps: ApiDeps, token: string, origin: string): Promise<Principal | null> {
  const parsed = parseToken(token);
  if (!parsed || (parsed.kind !== "pat" && parsed.kind !== "oat")) return null;
  if (parsed.kind === "pat") return resolvePat(deps, parsed.id, parsed.secret);
  return resolveAccess(deps, parsed.id, parsed.secret, origin);
}

async function resolvePat(deps: ApiDeps, id: string, secret: string): Promise<Principal | null> {
  const row = await deps.store.getPat(id);
  const matches = await secretMatches(deps.pepper, secret, row?.secretHash ?? null);
  if (!row || !matches || row.revokedAt || expired(row.expiresAt, deps.now())) return null;
  const at = deps.now().toISOString();
  await deps.store.touchPat(row.id, at);
  return { userId: row.userId, scopes: effectiveScopes(row.scopes), tokenId: row.id, kind: "pat" };
}

async function resolveAccess(deps: ApiDeps, id: string, secret: string, origin: string): Promise<Principal | null> {
  const row = await deps.store.getAccess(id);
  const matches = await secretMatches(deps.pepper, secret, row?.secretHash ?? null);
  if (!row || !matches || row.revokedAt || expired(row.expiresAt, deps.now())) return null;
  if (row.resource !== `${origin}/api/mcp`) return null;
  const grant = await deps.store.getGrant(row.grantId);
  if (!grant || grant.revokedAt || grant.userId !== row.userId) return null;
  const scopes = grant.scopes.filter((scope) => row.scopes.includes(scope));
  if (!hasScope(scopes, "read")) return null;
  const at = deps.now().toISOString();
  await deps.store.touchAccess(row.id, at);
  await deps.store.touchGrant(grant.id, at);
  return { userId: row.userId, scopes: effectiveScopes(scopes), tokenId: row.id, kind: "oauth" };
}

function effectiveScopes(scopes: Array<"read" | "write">): Array<"read" | "write"> {
  return scopes.includes("write") ? ["read", "write"] : ["read"];
}

export function publicPat(row: PatRow) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.tokenPrefix,
    scopes: row.scopes,
    created_at: row.createdAt,
    last_used_at: row.lastUsedAt,
    expires_at: row.expiresAt,
  };
}

export async function listPats(deps: ApiDeps, userId: string) {
  const rows = await deps.store.listPats(userId);
  return { status: 200, body: { tokens: rows.map(publicPat) } };
}

export async function createPat(deps: ApiDeps, userId: string, body: Record<string, unknown>) {
  const name = cleanName(body.name, LIMITS.name);
  if (!name) return { status: 400, body: { error: "Bad request" } };
  const scopes = scopesFromList(body.scopes, ["read"]);
  if (!scopes) return { status: 400, body: { error: "Bad request" } };
  let expiresAt: string | null = null;
  if (body.expires_at != null) {
    if (typeof body.expires_at !== "string") return { status: 400, body: { error: "Bad request" } };
    const when = new Date(body.expires_at);
    if (Number.isNaN(when.getTime())) return { status: 400, body: { error: "Bad request" } };
    const now = deps.now().getTime();
    if (when.getTime() <= now || when.getTime() > now + TWO_YEARS_MS) {
      return { status: 400, body: { error: "Bad request" } };
    }
    expiresAt = when.toISOString();
  }
  if (await deps.store.countActivePats(userId) >= 20) {
    return { status: 400, body: { error: "Too many tokens. Revoke one first." } };
  }
  const issued = await issueToken("pat", deps.pepper);
  const row: PatRow = {
    id: issued.id,
    userId,
    name,
    tokenPrefix: issued.prefix,
    secretHash: issued.secretHash,
    scopes,
    createdAt: deps.now().toISOString(),
    lastUsedAt: null,
    expiresAt,
    revokedAt: null,
  };
  await deps.store.insertPat(row);
  deps.log("pat_create", { tokenId: row.id });
  return {
    status: 201,
    body: {
      ...publicPat(row),
      token: issued.token,
    },
  };
}

export async function revokePat(deps: ApiDeps, userId: string, id: string) {
  const ok = await deps.store.revokePat(userId, id, deps.now().toISOString());
  if (!ok) return { status: 404, body: { error: "Not found" } };
  deps.log("pat_revoke", { tokenId: id });
  return { status: 200, body: { revoked: true } };
}
