import {
  issueToken,
  issueTokenWithId,
  parseToken,
  pkceMatches,
  randomClientId,
  randomUuid,
  secretMatches,
} from "./crypto";
import { redirectHost } from "./validate";
import type { ApiDeps, GrantRow, ServiceResult } from "./types";
import {
  cleanName,
  cleanState,
  LIMITS,
  resourceMatches,
  scopesFromList,
  scopesFromParam,
  validateCodeChallenge,
  validateRedirectUri,
  validateVerifier,
} from "./validate";

function result(status: number, body: unknown): ServiceResult {
  return { status, body };
}

function addSeconds(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

function expired(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() <= now.getTime();
}

function intersectScopes(granted: GrantRow["scopes"], requested: GrantRow["scopes"]): GrantRow["scopes"] {
  const allowed = new Set(granted);
  const next = requested.filter((scope) => allowed.has(scope));
  if (next.includes("write") && !next.includes("read")) next.unshift("read");
  if (!next.includes("read")) return ["read"];
  return next.includes("write") ? ["read", "write"] : ["read"];
}

export async function registerClient(deps: ApiDeps, body: Record<string, unknown>): Promise<ServiceResult> {
  const name = cleanName(body.client_name, LIMITS.clientName);
  if (!name) return result(400, { error: "invalid_client_metadata", error_description: "client_name is required" });
  if (body.token_endpoint_auth_method != null && body.token_endpoint_auth_method !== "none") {
    return result(400, { error: "invalid_client_metadata", error_description: "Only public clients are supported" });
  }
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length < 1 || body.redirect_uris.length > 5) {
    return result(400, { error: "invalid_client_metadata", error_description: "redirect_uris must contain 1 to 5 https URLs" });
  }
  const redirectUris: string[] = [];
  for (const uri of body.redirect_uris) {
    const valid = validateRedirectUri(uri);
    if (!valid) {
      return result(400, {
        error: "invalid_client_metadata",
        error_description: "redirect_uris must be https, or http on localhost",
      });
    }
    redirectUris.push(valid);
  }
  if (body.grant_types != null) {
    if (!Array.isArray(body.grant_types)) return result(400, { error: "invalid_client_metadata" });
    for (const grant of body.grant_types) {
      if (grant !== "authorization_code" && grant !== "refresh_token") {
        return result(400, { error: "invalid_client_metadata" });
      }
    }
  }
  if (body.response_types != null) {
    if (!Array.isArray(body.response_types) || body.response_types.some((item) => item !== "code")) {
      return result(400, { error: "invalid_client_metadata" });
    }
  }
  const row = {
    id: randomClientId(),
    name,
    redirectUris,
    createdAt: deps.now().toISOString(),
  };
  await deps.store.insertClient(row);
  deps.log("oauth_register", { clientId: row.id });
  return result(201, {
    client_id: row.id,
    client_name: row.name,
    redirect_uris: row.redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
}

export interface AuthorizeInput {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string | null;
  state: string | null;
  resource: string;
  origin: string;
}

async function loadAuthorize(deps: ApiDeps, input: AuthorizeInput) {
  const client = await deps.store.getClient(input.clientId);
  if (!client) return { error: result(400, { error: "invalid_request" }) };
  if (!client.redirectUris.includes(input.redirectUri)) return { error: result(400, { error: "invalid_request" }) };
  const challenge = validateCodeChallenge(input.codeChallengeMethod, input.codeChallenge);
  if (!challenge) return { error: result(400, { error: "invalid_request", error_description: "PKCE S256 is required" }) };
  if (!resourceMatches(input.resource, input.origin)) {
    return { error: result(400, { error: "invalid_target" }) };
  }
  const scopes = scopesFromParam(input.scope);
  if (!scopes) return { error: result(400, { error: "invalid_scope" }) };
  const state = cleanState(input.state);
  if (state == null) return { error: result(400, { error: "invalid_request" }) };
  return { client, challenge, scopes, state };
}

export async function previewAuthorization(deps: ApiDeps, url: URL): Promise<ServiceResult> {
  const loaded = await loadAuthorize(deps, {
    clientId: url.searchParams.get("client_id") ?? "",
    redirectUri: url.searchParams.get("redirect_uri") ?? "",
    codeChallenge: url.searchParams.get("code_challenge") ?? "",
    codeChallengeMethod: url.searchParams.get("code_challenge_method") ?? "",
    scope: url.searchParams.get("scope"),
    state: url.searchParams.get("state"),
    resource: url.searchParams.get("resource") ?? "",
    origin: url.origin,
  });
  if ("error" in loaded && loaded.error) return loaded.error;
  if (!("client" in loaded)) return result(400, { error: "invalid_request" });
  return result(200, {
    client_name: loaded.client.name,
    redirect_host: redirectHost(url.searchParams.get("redirect_uri") ?? "") ?? "",
    scopes: loaded.scopes,
    resource: canonicalFrom(url.origin),
  });
}

function canonicalFrom(origin: string): string {
  return `${origin}/api/mcp`;
}

export async function decideAuthorization(
  deps: ApiDeps,
  userId: string,
  body: Record<string, unknown>,
  origin: string,
): Promise<ServiceResult> {
  const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
  const loaded = await loadAuthorize(deps, {
    clientId: typeof body.client_id === "string" ? body.client_id : "",
    redirectUri,
    codeChallenge: typeof body.code_challenge === "string" ? body.code_challenge : "",
    codeChallengeMethod: typeof body.code_challenge_method === "string" ? body.code_challenge_method : "",
    scope: typeof body.scope === "string" ? body.scope : null,
    state: typeof body.state === "string" ? body.state : null,
    resource: typeof body.resource === "string" ? body.resource : "",
    origin,
  });
  if ("error" in loaded && loaded.error) return loaded.error;
  if (!("client" in loaded)) return result(400, { error: "invalid_request" });

  const decision = body.decision === "deny" ? "deny" : body.decision === "allow" ? "allow" : null;
  if (!decision) return result(400, { error: "invalid_request" });

  if (decision === "deny") {
    return result(200, { redirect_to: redirectWith(redirectUri, { error: "access_denied", state: loaded.state }) });
  }

  const approved = scopesFromList(body.scopes, loaded.scopes);
  if (!approved) return result(400, { error: "invalid_scope" });
  const scopes = intersectScopes(loaded.scopes, approved);
  const at = deps.now().toISOString();
  let grant = await deps.store.findActiveGrant(userId, loaded.client.id);
  if (grant) {
    await deps.store.revokeAccessForGrant(grant.id, at);
    await deps.store.revokeRefreshForGrant(grant.id, at);
    await deps.store.updateGrantScopes(grant.id, scopes, at);
    grant = { ...grant, scopes };
  } else {
    grant = {
      id: randomUuid(),
      userId,
      clientId: loaded.client.id,
      scopes,
      createdAt: at,
      revokedAt: null,
      lastUsedAt: at,
    };
    await deps.store.insertGrant(grant);
  }

  const issued = await issueToken("oac", deps.pepper);
  await deps.store.insertCode({
    id: issued.id,
    userId,
    clientId: loaded.client.id,
    grantId: grant.id,
    redirectUri,
    scopes,
    codeHash: issued.secretHash,
    codeChallenge: loaded.challenge,
    resource: canonicalFrom(origin),
    expiresAt: addSeconds(deps.now(), deps.codeTtlSeconds),
    usedAt: null,
  });
  deps.log("oauth_consent", { grantId: grant.id, clientId: loaded.client.id });
  return result(200, {
    redirect_to: redirectWith(redirectUri, { code: issued.token, state: loaded.state }),
  });
}

function redirectWith(redirectUri: string, params: { code?: string; error?: string; state?: string }): string {
  const url = new URL(redirectUri);
  if (params.code) url.searchParams.set("code", params.code);
  if (params.error) url.searchParams.set("error", params.error);
  if (params.state) url.searchParams.set("state", params.state);
  return url.toString();
}

function clientIdFrom(body: Record<string, unknown>, authorization: string | null): string | null {
  if (typeof body.client_id === "string" && body.client_id) return body.client_id;
  if (!authorization?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(authorization.slice(6).trim());
    const split = decoded.indexOf(":");
    if (split < 0) return null;
    const id = decoded.slice(0, split);
    const secret = decoded.slice(split + 1);
    if (secret !== "") return null;
    return id || null;
  } catch {
    return null;
  }
}

export async function tokenExchange(
  deps: ApiDeps,
  body: Record<string, unknown>,
  authorization: string | null,
  origin: string,
): Promise<ServiceResult> {
  const grantType = body.grant_type;
  if (grantType === "authorization_code") return exchangeCode(deps, body, authorization, origin);
  if (grantType === "refresh_token") return exchangeRefresh(deps, body, authorization, origin);
  return result(400, { error: "unsupported_grant_type" });
}

async function exchangeCode(
  deps: ApiDeps,
  body: Record<string, unknown>,
  authorization: string | null,
  origin: string,
): Promise<ServiceResult> {
  const clientId = clientIdFrom(body, authorization);
  const code = typeof body.code === "string" ? body.code : "";
  const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
  const verifier = validateVerifier(body.code_verifier);
  const parsed = parseToken(code);
  if (!clientId || !parsed || parsed.kind !== "oac" || !verifier) {
    return result(400, { error: "invalid_grant" });
  }
  if (!resourceMatches(body.resource, origin)) return result(400, { error: "invalid_target" });
  const at = deps.now().toISOString();
  const row = await deps.store.consumeCode(parsed.id, at);
  const matches = await secretMatches(deps.pepper, parsed.secret, row?.codeHash ?? null);
  if (!row || !matches || row.clientId !== clientId || row.redirectUri !== redirectUri) {
    return result(400, { error: "invalid_grant" });
  }
  if (row.resource !== canonicalFrom(origin)) return result(400, { error: "invalid_target" });
  const challengeOk = await pkceMatches(verifier, row.codeChallenge);
  if (!challengeOk) return result(400, { error: "invalid_grant" });
  const grant = await deps.store.getGrant(row.grantId);
  if (!grant || grant.revokedAt || grant.userId !== row.userId) return result(400, { error: "invalid_grant" });
  return issuePair(deps, grant, row.scopes, row.resource);
}

async function exchangeRefresh(
  deps: ApiDeps,
  body: Record<string, unknown>,
  authorization: string | null,
  origin: string,
): Promise<ServiceResult> {
  const clientId = clientIdFrom(body, authorization);
  const presented = typeof body.refresh_token === "string" ? body.refresh_token : "";
  const parsed = parseToken(presented);
  if (!clientId || !parsed || parsed.kind !== "ort") return result(400, { error: "invalid_grant" });
  if (body.resource != null && !resourceMatches(body.resource, origin)) return result(400, { error: "invalid_target" });
  const row = await deps.store.getRefresh(parsed.id);
  const matches = await secretMatches(deps.pepper, parsed.secret, row?.secretHash ?? null);
  if (!row || !matches) return result(400, { error: "invalid_grant" });
  const at = deps.now().toISOString();
  if (row.revokedAt) {
    await deps.store.revokeGrant(row.userId, row.grantId, at);
    deps.log("oauth_refresh_reuse", { grantId: row.grantId });
    return result(400, { error: "invalid_grant" });
  }
  if (expired(row.expiresAt, deps.now()) || row.resource !== canonicalFrom(origin)) {
    return result(400, { error: "invalid_grant" });
  }
  const grant = await deps.store.getGrant(row.grantId);
  const client = grant ? await deps.store.getClient(grant.clientId) : null;
  if (!grant || grant.revokedAt || !client || client.id !== clientId) return result(400, { error: "invalid_grant" });
  const replacementId = randomUuid();
  const rotated = await deps.store.rotateRefresh(row.id, at, replacementId);
  if (!rotated) {
    await deps.store.revokeGrant(row.userId, row.grantId, at);
    deps.log("oauth_refresh_reuse", { grantId: row.grantId });
    return result(400, { error: "invalid_grant" });
  }
  const scopes = intersectScopes(grant.scopes, row.scopes);
  return issuePair(deps, grant, scopes, row.resource, replacementId);
}

async function issuePair(
  deps: ApiDeps,
  grant: GrantRow,
  scopes: GrantRow["scopes"],
  resource: string,
  refreshId?: string,
): Promise<ServiceResult> {
  const at = deps.now();
  const access = await issueToken("oat", deps.pepper);
  const refresh = refreshId
    ? await issueTokenWithId("ort", deps.pepper, refreshId)
    : await issueToken("ort", deps.pepper);
  await deps.store.insertAccess({
    id: access.id,
    grantId: grant.id,
    userId: grant.userId,
    secretHash: access.secretHash,
    tokenPrefix: access.prefix,
    scopes,
    resource,
    expiresAt: addSeconds(at, deps.accessTtlSeconds),
    revokedAt: null,
    lastUsedAt: null,
  });
  await deps.store.insertRefresh({
    id: refresh.id,
    grantId: grant.id,
    userId: grant.userId,
    secretHash: refresh.secretHash,
    tokenPrefix: refresh.prefix,
    scopes,
    resource,
    expiresAt: addSeconds(at, deps.refreshTtlSeconds),
    revokedAt: null,
    replacedBy: null,
    lastUsedAt: null,
  });
  await deps.store.touchGrant(grant.id, at.toISOString());
  deps.log("oauth_token", { grantId: grant.id });
  return result(200, {
    access_token: access.token,
    refresh_token: refresh.token,
    token_type: "Bearer",
    expires_in: deps.accessTtlSeconds,
    scope: scopes.join(" "),
  });
}

export async function revokePresentedToken(
  deps: ApiDeps,
  body: Record<string, unknown>,
  authorization: string | null,
): Promise<ServiceResult> {
  const presented = typeof body.token === "string" ? body.token : "";
  const parsed = parseToken(presented);
  const at = deps.now().toISOString();
  if (!parsed) return result(200, {});
  if (parsed.kind === "oat") {
    const row = await deps.store.getAccess(parsed.id);
    const matches = await secretMatches(deps.pepper, parsed.secret, row?.secretHash ?? null);
    if (row && matches) await deps.store.revokeAccessForGrant(row.grantId, at);
  } else if (parsed.kind === "ort") {
    const row = await deps.store.getRefresh(parsed.id);
    const matches = await secretMatches(deps.pepper, parsed.secret, row?.secretHash ?? null);
    if (row && matches) await deps.store.revokeGrant(row.userId, row.grantId, at);
  }
  void authorization;
  deps.log("oauth_revoke", {});
  return result(200, {});
}

export async function listConnectedApps(deps: ApiDeps, userId: string): Promise<ServiceResult> {
  const grants = await deps.store.listGrants(userId);
  const apps = [];
  for (const grant of grants) {
    const client = await deps.store.getClient(grant.clientId);
    const hosts = (client?.redirectUris ?? []).map((uri) => redirectHost(uri)).filter((host): host is string => Boolean(host));
    apps.push({
      id: grant.id,
      client_id: grant.clientId,
      client_name: client?.name ?? "Unknown app",
      redirect_hosts: [...new Set(hosts)],
      scopes: grant.scopes,
      created_at: grant.createdAt,
      last_used_at: grant.lastUsedAt,
    });
  }
  return result(200, { grants: apps });
}

export async function revokeConnectedApp(deps: ApiDeps, userId: string, id: string): Promise<ServiceResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return result(404, { error: "Not found" });
  const ok = await deps.store.revokeGrant(userId, id, deps.now().toISOString());
  if (!ok) return result(404, { error: "Not found" });
  deps.log("oauth_grant_revoke", { grantId: id });
  return result(200, { revoked: true });
}
