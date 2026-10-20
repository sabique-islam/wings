import { hmacHex } from "./crypto";
import { makeSessionVerifier } from "./session";
import { createServiceClient, createSupabaseStore } from "./supabaseStore";
import { DEFAULT_LIMITS } from "./types";
import {
  bearerToken,
  clientAddress,
  emptyResponse,
  forbidden,
  isResourceMetadataPath,
  isServerMetadataPath,
  jsonResponse,
  logLine,
  metadataResponse,
  parseBody,
  readLimited,
  resourceOriginAllowed,
  sameSite,
  serverEnv,
  tooMany,
  unauthorized,
  wwwAuthenticate,
} from "./http";
import { handleMcp } from "./mcp";
import {
  decideAuthorization,
  listConnectedApps,
  previewAuthorization,
  registerClient,
  revokeConnectedApp,
  revokePresentedToken,
  tokenExchange,
} from "./oauth";
import { appendPage, createPage, getPage, isStoreError, listPages, searchPages, updatePage } from "./pages";
import { createPat, listPats, resolvePrincipal, revokePat } from "./tokens";
import type { ApiDeps, Principal, ServiceResult } from "./types";
import { StoreError } from "./types";
import { isUuid, LIMITS } from "./validate";

const UUID = "([0-9a-f-]{36})";

export async function handleRequest(request: Request, deps?: ApiDeps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (request.method === "GET" && isResourceMetadataPath(path)) return metadataResponse(url.origin, "resource");
  if (request.method === "GET" && isServerMetadataPath(path)) return metadataResponse(url.origin, "server");
  if (!deps) {
    const loaded = loadProductionDeps();
    if (!loaded) return jsonResponse(503, { error: "Service unavailable" });
    deps = loaded;
  }
  try {
    return await dispatch(request, url, path, deps);
  } catch (error) {
    if (error instanceof StoreError || isStoreError(error)) {
      deps.log("store_error", {});
      return jsonResponse(503, { error: "Service unavailable" });
    }
    deps.log("unhandled", { name: error instanceof Error ? error.name : "Error" });
    return jsonResponse(500, { error: "Something went wrong" });
  }
}

async function dispatch(request: Request, url: URL, path: string, deps: ApiDeps): Promise<Response> {
  if (request.method === "OPTIONS") return emptyResponse(204);

  if (path === "/api/mcp") return mcp(request, url, deps);
  if (path === "/api/oauth/register") return register(request, deps);
  if (path === "/api/oauth/authorize/preview" && request.method === "GET") {
    if (!(await allowIp(request, deps))) return tooMany();
    return fromService(url.origin, await previewAuthorization(deps, url));
  }
  if (path === "/api/oauth/authorize") return consent(request, url, deps);
  if (path === "/api/oauth/token") return token(request, url, deps);
  if (path === "/api/oauth/revoke") return revokeOauth(request, deps);

  if (path === "/api/v1/tokens") return pats(request, deps);
  const revokePatMatch = path.match(new RegExp(`^/api/v1/tokens/${UUID}/revoke$`, "i"));
  if (revokePatMatch && request.method === "POST") {
    return sessionRoute(request, deps, (userId) => revokePat(deps, userId, revokePatMatch[1]!.toLowerCase()));
  }
  if (path === "/api/v1/oauth/grants" && request.method === "GET") {
    return sessionRoute(request, deps, (userId) => listConnectedApps(deps, userId));
  }
  const revokeGrantMatch = path.match(new RegExp(`^/api/v1/oauth/grants/${UUID}/revoke$`, "i"));
  if (revokeGrantMatch && request.method === "POST") {
    return sessionRoute(request, deps, (userId) => revokeConnectedApp(deps, userId, revokeGrantMatch[1]!.toLowerCase()));
  }

  if (path === "/api/v1/search" && request.method === "GET") {
    return authed(request, url, deps, (principal) => searchPages(deps, principal, url));
  }
  if (path === "/api/v1/pages" && request.method === "GET") {
    return authed(request, url, deps, (principal) => listPages(deps, principal, url));
  }
  if (path === "/api/v1/pages" && request.method === "POST") {
    return authed(request, url, deps, (principal, body) => createPage(deps, principal, body), true);
  }
  const pageMatch = path.match(new RegExp(`^/api/v1/pages/${UUID}$`, "i"));
  if (pageMatch && request.method === "GET") {
    return authed(request, url, deps, (principal) => getPage(deps, principal, pageMatch[1]!.toLowerCase()));
  }
  if (pageMatch && request.method === "PATCH") {
    return authed(request, url, deps, (principal, body) => updatePage(deps, principal, pageMatch[1]!.toLowerCase(), body), true);
  }
  const appendMatch = path.match(new RegExp(`^/api/v1/pages/${UUID}/append$`, "i"));
  if (appendMatch && request.method === "POST") {
    return authed(
      request,
      url,
      deps,
      (principal, body) => appendPage(deps, principal, appendMatch[1]!.toLowerCase(), body),
      true,
    );
  }

  if (path.startsWith("/api/")) return jsonResponse(404, { error: "Not found" });
  return jsonResponse(404, { error: "Not found" });
}

async function mcp(request: Request, url: URL, deps: ApiDeps): Promise<Response> {
  if (request.method === "GET" || request.method === "DELETE") {
    return jsonResponse(405, { error: "Method not allowed" }, { allow: "POST" });
  }
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" }, { allow: "POST" });
  if (!resourceOriginAllowed(request)) return jsonResponse(403, { error: "Forbidden" });
  if (!(await allowIp(request, deps))) return tooMany();
  const text = await readLimited(request, LIMITS.mcpBody);
  if (!text.ok) return jsonResponse(413, { error: "Payload too large" });
  let payload: unknown;
  try {
    payload = text.text ? JSON.parse(text.text) : null;
  } catch {
    return mcpError(url.origin, request);
  }
  const token = bearerToken(request);
  if (!token) return unauthorized(url.origin);
  const principal = await resolvePrincipal(deps, token, url.origin);
  if (!principal) return unauthorized(url.origin);
  if (!(await allowToken(deps, principal))) return tooMany();
  const response = await handleMcp(deps, principal, payload, request.headers.get("accept"), url.origin);
  if (response.status === 403) {
    const headers = new Headers(response.headers);
    headers.set("www-authenticate", wwwAuthenticate(url.origin, "insufficient_scope"));
    return new Response(response.body, { status: 403, headers });
  }
  return response;
}

function mcpError(origin: string): Response {
  return jsonResponse(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, {
    "www-authenticate": wwwAuthenticate(origin, "invalid_token"),
  });
}

async function register(request: Request, deps: ApiDeps): Promise<Response> {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  if (!(await allowIp(request, deps))) return tooMany();
  const bucket = `reg:${await ipHash(request, deps)}`;
  if (!(await allow(deps, bucket, 3600, deps.limits.registerPerHour))) return tooMany();
  const body = await jsonBody(request, LIMITS.oauthBody);
  if (!body.ok) return body.response;
  return fromService(new URL(request.url).origin, await registerClient(deps, body.value));
}

async function consent(request: Request, url: URL, deps: ApiDeps): Promise<Response> {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  return sessionRoute(request, deps, async (userId, body) => decideAuthorization(deps, userId, body, url.origin));
}

async function token(request: Request, url: URL, deps: ApiDeps): Promise<Response> {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  if (!(await allowIp(request, deps))) return tooMany();
  const body = await formOrJson(request, LIMITS.tokenBody);
  if (!body.ok) return body.response;
  return fromService(url.origin, await tokenExchange(deps, body.value, request.headers.get("authorization"), url.origin));
}

async function revokeOauth(request: Request, deps: ApiDeps): Promise<Response> {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  if (!(await allowIp(request, deps))) return tooMany();
  const body = await formOrJson(request, LIMITS.tokenBody);
  if (!body.ok) return body.response;
  return fromService(new URL(request.url).origin, await revokePresentedToken(deps, body.value, request.headers.get("authorization")));
}

async function pats(request: Request, deps: ApiDeps): Promise<Response> {
  if (request.method === "GET") return sessionRoute(request, deps, (userId) => listPats(deps, userId));
  if (request.method === "POST") return sessionRoute(request, deps, (userId, body) => createPat(deps, userId, body));
  return jsonResponse(405, { error: "Method not allowed" });
}

async function authed(
  request: Request,
  url: URL,
  deps: ApiDeps,
  run: (principal: Principal, body: Record<string, unknown>) => Promise<ServiceResult>,
  withBody = false,
): Promise<Response> {
  if (!resourceOriginAllowed(request)) return jsonResponse(403, { error: "Forbidden" });
  if (!(await allowIp(request, deps))) return tooMany();
  let body: Record<string, unknown> = {};
  if (withBody) {
    const parsed = await jsonBody(request, LIMITS.jsonBody);
    if (!parsed.ok) return parsed.response;
    body = parsed.value;
  }
  const token = bearerToken(request);
  if (!token) return unauthorized(url.origin);
  const principal = await resolvePrincipal(deps, token, url.origin);
  if (!principal) return unauthorized(url.origin);
  if (!(await allowToken(deps, principal))) return tooMany();
  return fromService(url.origin, await run(principal, body));
}

async function sessionRoute(
  request: Request,
  deps: ApiDeps,
  run: (userId: string, body: Record<string, unknown>) => Promise<ServiceResult>,
): Promise<Response> {
  const url = new URL(request.url);
  if (!sameSite(request) || request.headers.get("sec-fetch-site") === "cross-site") {
    return jsonResponse(403, { error: "Forbidden" });
  }
  if (request.headers.get("x-wings-session") !== "1") return unauthorized(url.origin);
  if (!(await allowIp(request, deps))) return tooMany();
  const token = bearerToken(request);
  if (!token) return unauthorized(url.origin);
  const session = await deps.verifySession(token);
  if (!session || !isUuid(session.userId)) return unauthorized(url.origin);
  if (!(await allow(deps, `session:${session.userId}`, 3600, deps.limits.sessionPerHour))) return tooMany();
  let body: Record<string, unknown> = {};
  if (request.method !== "GET" && request.method !== "HEAD") {
    const parsed = await jsonBody(request, LIMITS.oauthBody);
    if (!parsed.ok) return parsed.response;
    body = parsed.value;
  }
  return fromService(url.origin, await run(session.userId, body));
}

function fromService(origin: string, service: ServiceResult): Response {
  if (service.status === 401 || service.authError === "invalid_token") return unauthorized(origin);
  if (service.authError === "insufficient_scope") return forbidden(origin);
  return jsonResponse(service.status, service.body);
}

async function allowIp(request: Request, deps: ApiDeps): Promise<boolean> {
  return allow(deps, `ip:${await ipHash(request, deps)}`, 60, deps.limits.ipPerMinute);
}

async function allowToken(deps: ApiDeps, principal: Principal): Promise<boolean> {
  return allow(deps, `tok:${principal.tokenId}`, 60, deps.limits.tokenPerMinute);
}

async function allow(deps: ApiDeps, bucket: string, windowSeconds: number, limit: number): Promise<boolean> {
  try {
    const result = await deps.store.hitRateLimit(bucket, windowSeconds, limit);
    return result.allowed;
  } catch (error) {
    if (error instanceof StoreError) throw error;
    return false;
  }
}

async function ipHash(request: Request, deps: ApiDeps): Promise<string> {
  return (await hmacHex(deps.pepper, `ip:${clientAddress(request)}`)).slice(0, 32);
}

async function jsonBody(
  request: Request,
  max: number,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  const text = await readLimited(request, max);
  if (!text.ok) return { ok: false, response: jsonResponse(413, { error: "Payload too large" }) };
  const contentType = request.headers.get("content-type");
  if (text.text && contentType && !contentType.includes("application/json")) {
    return { ok: false, response: jsonResponse(415, { error: "Unsupported media type" }) };
  }
  const value = parseBody(text.text, "application/json");
  if (!value) return { ok: false, response: jsonResponse(400, { error: "Bad request" }) };
  return { ok: true, value };
}

async function formOrJson(
  request: Request,
  max: number,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  const text = await readLimited(request, max);
  if (!text.ok) return { ok: false, response: jsonResponse(413, { error: "Payload too large" }) };
  const value = parseBody(text.text, request.headers.get("content-type"));
  if (!value) return { ok: false, response: jsonResponse(400, { error: "invalid_request" }) };
  return { ok: true, value };
}

let productionDeps: ApiDeps | null | undefined;

export function loadProductionDeps(): ApiDeps | null {
  if (productionDeps !== undefined) return productionDeps;
  productionDeps = buildProductionDeps();
  return productionDeps;
}

function buildProductionDeps(): ApiDeps | null {
  const pepper = serverEnv("API_TOKEN_PEPPER");
  const url = serverEnv("SUPABASE_URL") || serverEnv("VITE_SUPABASE_URL");
  const publishable = serverEnv("SUPABASE_PUBLISHABLE_KEY") || serverEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = serverEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (pepper.length < 32 || !url || !publishable || !serviceKey) {
    logLine("api_config_missing", {
      hasPepper: pepper.length >= 32,
      hasUrl: Boolean(url),
      hasPublishable: Boolean(publishable),
      hasServiceKey: Boolean(serviceKey),
    });
    return null;
  }
  return {
    store: createSupabaseStore(createServiceClient(url, serviceKey)),
    pepper,
    verifySession: makeSessionVerifier(url, publishable),
    now: () => new Date(),
    log: (event, fields) => logLine(event, fields),
    limits: DEFAULT_LIMITS,
    accessTtlSeconds: 60 * 60,
    refreshTtlSeconds: 30 * 24 * 60 * 60,
    codeTtlSeconds: 60,
  };
}
