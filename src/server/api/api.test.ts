import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseToken, pkceS256, secretMatches, timingSafeEqual } from "./crypto";
import { redact } from "./http";
import { createMemoryStore } from "./memoryStore";
import { MCP_TOOL_NAMES } from "./mcp";
import { handleRequest } from "./router";
import type { ApiDeps, PageRow } from "./types";
import { EMPTY_DOC } from "./pages";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const PEPPER = "test-pepper-0123456789abcdef0123456789";
const ORIGIN = "http://localhost";

function harness(overrides: Partial<ApiDeps> = {}) {
  let now = new Date("2026-10-20T12:00:00.000Z");
  const logs: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  const store = createMemoryStore(() => now);
  const deps: ApiDeps = {
    store,
    pepper: PEPPER,
    verifySession: async (token) => {
      if (token === "session-a") return { userId: USER_A };
      if (token === "session-b") return { userId: USER_B };
      return null;
    },
    now: () => now,
    log: (event, fields) => logs.push({ event, fields }),
    limits: { ipPerMinute: 1000, tokenPerMinute: 1000, registerPerHour: 1000, sessionPerHour: 1000 },
    accessTtlSeconds: 3600,
    refreshTtlSeconds: 30 * 24 * 3600,
    codeTtlSeconds: 60,
    ...overrides,
  };
  if (overrides.store) deps.store = overrides.store;
  return {
    deps,
    store,
    logs,
    setNow(next: Date) {
      now = next;
    },
  };
}

async function call(
  deps: ApiDeps,
  method: string,
  pathname: string,
  init: {
    token?: string;
    session?: "session-a" | "session-b";
    body?: unknown;
    raw?: string;
    contentType?: string;
    ip?: string;
    headers?: Record<string, string>;
    origin?: string;
  } = {},
) {
  const headers = new Headers(init.headers);
  if (init.session) {
    headers.set("authorization", `Bearer ${init.session}`);
    headers.set("x-wings-session", "1");
  } else if (init.token) {
    headers.set("authorization", `Bearer ${init.token}`);
  }
  if (init.ip) headers.set("x-real-ip", init.ip);
  const raw = init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body));
  if (raw !== undefined && !headers.has("content-type")) {
    headers.set("content-type", init.contentType ?? "application/json");
  }
  if (init.contentType) headers.set("content-type", init.contentType);
  const response = await handleRequest(new Request(`${ORIGIN}${pathname}`, {
    method,
    headers,
    body: raw,
  }), deps);
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: response.status, json, text, headers: response.headers };
}

function seed(store: ReturnType<typeof createMemoryStore>, row: Partial<PageRow> & Pick<PageRow, "id" | "userId" | "content">): void {
  store.pages.set(row.id, {
    id: row.id,
    userId: row.userId,
    title: row.title ?? "",
    parentId: row.parentId ?? null,
    content: row.content,
    contentStorage: row.contentStorage ?? "cloud",
    createdAt: row.createdAt ?? "2026-10-20T12:00:00.000Z",
    updatedAt: row.updatedAt ?? "2026-10-20T12:00:00.000Z",
    deletedAt: row.deletedAt ?? null,
  });
}

async function mintPat(deps: ApiDeps, scopes?: string[]) {
  const response = await call(deps, "POST", "/api/v1/tokens", {
    session: "session-a",
    body: { name: "laptop", scopes },
  });
  expect(response.status).toBe(201);
  return response.json as { token: string; id: string; scopes: string[]; prefix: string };
}

describe("token crypto", () => {
  it("issues a 256-bit secret with a recognizable prefix and compares in constant time", async () => {
    const { deps, store } = harness();
    const minted = await mintPat(deps);
    expect(minted.token.startsWith("wings_pat_")).toBe(true);
    expect(minted.prefix.startsWith("wings_pat_")).toBe(true);
    const parsed = parseToken(minted.token);
    expect(parsed?.kind).toBe("pat");
    expect(parsed?.secret).toHaveLength(43);
    const row = await store.getPat(minted.id);
    expect(row?.secretHash).not.toContain(parsed?.secret);
    expect(row?.secretHash).not.toBe(minted.token);
    expect(await secretMatches(PEPPER, parsed!.secret, row!.secretHash)).toBe(true);
    expect(await secretMatches(PEPPER, parsed!.secret, null)).toBe(false);
    const same = new Uint8Array([1, 2, 3, 4]);
    expect(timingSafeEqual(same, same)).toBe(true);
    expect(timingSafeEqual(same, new Uint8Array([1, 2, 3, 5]))).toBe(false);
  });

  it("redacts token and note fields before they can be logged", () => {
    const redacted = redact({ token: "wings_pat_secret", content: "note body", pageId: "ok" }) as Record<string, unknown>;
    expect(redacted.token).toBe("[redacted]");
    expect(redacted.content).toBe("[redacted]");
    expect(redacted.pageId).toBe("ok");
  });
});

describe("personal access tokens", () => {
  it("defaults to read-only, shows the secret once, and rejects revoked, expired, and wrong-scope tokens", async () => {
    const env = harness();
    const minted = await mintPat(env.deps);
    expect(minted.scopes).toEqual(["read"]);

    const listed = await call(env.deps, "GET", "/api/v1/tokens", { session: "session-a" });
    expect(JSON.stringify(listed.json)).not.toContain(minted.token);
    expect(listed.headers.get("access-control-allow-origin")).toBeNull();

    const denied = await call(env.deps, "POST", "/api/v1/pages", {
      token: minted.token,
      body: { title: "Nope", content: "secret note" },
    });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("www-authenticate")).toContain("insufficient_scope");

    const writer = await mintPat(env.deps, ["write"]);
    expect(writer.scopes).toEqual(["read", "write"]);
    const created = await call(env.deps, "POST", "/api/v1/pages", {
      token: writer.token,
      body: { title: "Cloud", content: "Hello from the API" },
    });
    expect(created.status).toBe(201);

    const revoked = await call(env.deps, "POST", `/api/v1/tokens/${minted.id}/revoke`, { session: "session-a" });
    expect(revoked.status).toBe(200);
    const after = await call(env.deps, "GET", "/api/v1/pages", { token: minted.token });
    expect(after.status).toBe(401);

    env.setNow(new Date("2026-10-20T11:00:00.000Z"));
    const expiring = await call(env.deps, "POST", "/api/v1/tokens", {
      session: "session-a",
      body: { name: "short", expires_at: "2026-10-20T12:30:00.000Z" },
    });
    expect(expiring.status).toBe(201);
    const expiringToken = (expiring.json as { token: string }).token;
    env.setNow(new Date("2026-10-20T13:00:00.000Z"));
    const expired = await call(env.deps, "GET", "/api/v1/pages", { token: expiringToken });
    expect(expired.status).toBe(401);
    expect(expired.json).toEqual({ error: "Unauthorized" });
  });

  it("requires a same-site session header to mint or revoke", async () => {
    const { deps } = harness();
    const missing = await call(deps, "POST", "/api/v1/tokens", {
      body: { name: "laptop" },
      headers: { authorization: "Bearer session-a" },
    });
    expect(missing.status).toBe(401);
    const cross = await call(deps, "POST", "/api/v1/tokens", {
      session: "session-a",
      body: { name: "laptop" },
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(cross.status).toBe(403);
  });
});

describe("pages API", () => {
  it("scopes every read and write to the token owner and reports local-vault pages", async () => {
    const env = harness();
    const writer = await mintPat(env.deps, ["write"]);
    const writes: Array<Record<string, unknown>> = [];
    const original = env.store.updatePage.bind(env.store);
    env.store.updatePage = async (userId, id, patch, mode) => {
      writes.push({ userId, patch, mode });
      return original(userId, id, patch, mode);
    };
    seed(env.store, {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      userId: USER_A,
      title: "Mine",
      content: "UNIQUE_NOTE_BODY_9f3a",
    });
    seed(env.store, {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      userId: USER_B,
      title: "Theirs",
      content: "OTHER_USER_SECRET_BODY",
    });
    seed(env.store, {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      userId: USER_A,
      title: "On this device",
      content: "LOCAL_ONLY_SECRET_BODY",
      contentStorage: "local",
    });

    const list = await call(env.deps, "GET", "/api/v1/pages", { token: writer.token });
    expect(list.status).toBe(200);
    const pages = (list.json as { pages: Array<{ id: string; server_readable: boolean }> }).pages;
    expect(pages.map((page) => page.id).sort()).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ]);
    expect(JSON.stringify(list.json)).not.toContain("OTHER_USER_SECRET_BODY");
    expect(JSON.stringify(list.json)).not.toContain("LOCAL_ONLY_SECRET_BODY");

    const theirs = await call(env.deps, "GET", "/api/v1/pages/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", { token: writer.token });
    expect(theirs.status).toBe(404);
    expect(JSON.stringify(theirs.json)).not.toContain("OTHER_USER_SECRET_BODY");

    const local = await call(env.deps, "GET", "/api/v1/pages/cccccccc-cccc-4ccc-8ccc-cccccccccccc", { token: writer.token });
    expect(local.status).toBe(200);
    expect(JSON.stringify(local.json)).not.toContain("LOCAL_ONLY_SECRET_BODY");
    expect(JSON.stringify(local.json)).toContain("local vault");
    expect((local.json as { server_readable: boolean }).server_readable).toBe(false);

    const localWrite = await call(env.deps, "POST", "/api/v1/pages/cccccccc-cccc-4ccc-8ccc-cccccccccccc/append", {
      token: writer.token,
      body: { content: "nope" },
    });
    expect(localWrite.status).toBe(409);

    const mine = await call(env.deps, "GET", "/api/v1/pages/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { token: writer.token });
    expect((mine.json as { content: string }).content).toBe("UNIQUE_NOTE_BODY_9f3a");

    const search = await call(env.deps, "GET", "/api/v1/search?q=UNIQUE_NOTE", { token: writer.token });
    expect(search.status).toBe(200);
    expect(JSON.stringify(search.json)).not.toContain("UNIQUE_NOTE_BODY_9f3a");

    const localSearch = await call(env.deps, "GET", "/api/v1/search?q=LOCAL_ONLY_SECRET", { token: writer.token });
    expect((localSearch.json as { pages: unknown[] }).pages).toEqual([]);

    const wiped = await call(env.deps, "PATCH", "/api/v1/pages/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      token: writer.token,
      body: { content: "   " },
    });
    expect(wiped.status).toBe(400);
    const still = await env.store.getPage(USER_A, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(still?.content).toBe("UNIQUE_NOTE_BODY_9f3a");

    const appended = await call(env.deps, "POST", "/api/v1/pages/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/append", {
      token: writer.token,
      body: { content: "More text" },
    });
    expect(appended.status).toBe(200);
    expect((appended.json as { content: string }).content).toContain("More text");
    expect(writes.some((write) => write.mode === "body" && JSON.stringify((write.patch as { contentJson?: unknown }).contentJson) === JSON.stringify(EMPTY_DOC))).toBe(true);

    const stolen = await call(env.deps, "PATCH", "/api/v1/pages/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
      token: writer.token,
      body: { content: "overwrite" },
    });
    expect(stolen.status).toBe(404);
    expect((await env.store.getPage(USER_B, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"))?.content).toBe("OTHER_USER_SECRET_BODY");

    const created = await call(env.deps, "POST", "/api/v1/pages", {
      token: writer.token,
      body: { title: "Child", content: "Nested", parent_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    });
    expect(created.status).toBe(201);
    expect((created.json as { parent_id: string }).parent_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    expect(JSON.stringify(env.logs)).not.toContain("UNIQUE_NOTE_BODY_9f3a");
    expect(JSON.stringify(env.logs)).not.toContain(writer.token);
  });

  it("rate limits by token and by IP", async () => {
    const env = harness();
    env.deps.limits = { ipPerMinute: 2, tokenPerMinute: 1000, registerPerHour: 1000, sessionPerHour: 1000 };
    const first = await call(env.deps, "GET", "/api/v1/pages", { ip: "203.0.113.5" });
    const second = await call(env.deps, "GET", "/api/v1/pages", { ip: "203.0.113.5" });
    const third = await call(env.deps, "GET", "/api/v1/pages", { ip: "203.0.113.5" });
    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(third.status).toBe(429);

    const tokenEnv = harness();
    tokenEnv.deps.limits = { ipPerMinute: 1000, tokenPerMinute: 2, registerPerHour: 1000, sessionPerHour: 1000 };
    const token = await mintPat(tokenEnv.deps);
    expect((await call(tokenEnv.deps, "GET", "/api/v1/pages", { token: token.token, ip: "203.0.113.9" })).status).toBe(200);
    expect((await call(tokenEnv.deps, "GET", "/api/v1/pages", { token: token.token, ip: "203.0.113.9" })).status).toBe(200);
    expect((await call(tokenEnv.deps, "GET", "/api/v1/pages", { token: token.token, ip: "203.0.113.9" })).status).toBe(429);
  });
});

describe("oauth and mcp", () => {
  async function registerAndAuthorize(deps: ApiDeps, scope = "read") {
    const verifier = "a".repeat(64);
    const challenge = await pkceS256(verifier);
    const registered = await call(deps, "POST", "/api/oauth/register", {
      body: {
        client_name: "Claude",
        redirect_uris: ["https://client.example/callback"],
        token_endpoint_auth_method: "none",
      },
    });
    expect(registered.status).toBe(201);
    const clientId = (registered.json as { client_id: string }).client_id;
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: "https://client.example/callback",
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope,
      state: "state-1",
      resource: `${ORIGIN}/api/mcp`,
      response_type: "code",
    });
    const preview = await call(deps, "GET", `/api/oauth/authorize/preview?${query}`);
    expect(preview.status).toBe(200);
    expect((preview.json as { client_name: string }).client_name).toBe("Claude");
    const consent = await call(deps, "POST", "/api/oauth/authorize", {
      session: "session-a",
      body: {
        client_id: clientId,
        redirect_uri: "https://client.example/callback",
        code_challenge: challenge,
        code_challenge_method: "S256",
        scope,
        state: "state-1",
        resource: `${ORIGIN}/api/mcp`,
        decision: "allow",
        scopes: scope.split(" "),
      },
    });
    expect(consent.status).toBe(200);
    const redirect = new URL((consent.json as { redirect_to: string }).redirect_to);
    expect(redirect.origin + redirect.pathname).toBe("https://client.example/callback");
    expect(redirect.searchParams.get("state")).toBe("state-1");
    return {
      clientId,
      verifier,
      code: redirect.searchParams.get("code") ?? "",
    };
  }

  it("rejects bad redirects and PKCE, then issues and rotates tokens", async () => {
    const env = harness();
    const bad = await call(env.deps, "POST", "/api/oauth/register", {
      body: { client_name: "Evil", redirect_uris: ["http://evil.example/callback"] },
    });
    expect(bad.status).toBe(400);

    const plain = await call(env.deps, "GET", "/api/oauth/authorize/preview?client_id=x&redirect_uri=https://client.example/callback&code_challenge=abc&code_challenge_method=plain&resource=http://localhost/api/mcp");
    expect(plain.status).toBe(400);

    const flow = await registerAndAuthorize(env.deps, "read write");
    const mismatch = await call(env.deps, "POST", "/api/oauth/authorize", {
      session: "session-a",
      body: {
        client_id: flow.clientId,
        redirect_uri: "https://evil.example/callback",
        code_challenge: await pkceS256(flow.verifier),
        code_challenge_method: "S256",
        resource: `${ORIGIN}/api/mcp`,
        decision: "allow",
      },
    });
    expect(mismatch.status).toBe(400);
    expect(JSON.stringify(mismatch.json)).not.toContain("evil.example");

    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code: flow.code,
      redirect_uri: "https://client.example/callback",
      client_id: flow.clientId,
      code_verifier: flow.verifier,
      resource: `${ORIGIN}/api/mcp`,
    });
    const token = await call(env.deps, "POST", "/api/oauth/token", {
      raw: form.toString(),
      contentType: "application/x-www-form-urlencoded",
    });
    expect(token.status).toBe(200);
    const access = (token.json as { access_token: string; refresh_token: string }).access_token;
    const refresh = (token.json as { refresh_token: string }).refresh_token;
    expect(access.startsWith("wings_oat_")).toBe(true);
    expect(refresh.startsWith("wings_ort_")).toBe(true);

    const reused = await call(env.deps, "POST", "/api/oauth/token", {
      raw: form.toString(),
      contentType: "application/x-www-form-urlencoded",
    });
    expect(reused.status).toBe(400);

    const readOnly = await registerAndAuthorize(env.deps, "read");
    const readToken = await call(env.deps, "POST", "/api/oauth/token", {
      body: {
        grant_type: "authorization_code",
        code: readOnly.code,
        redirect_uri: "https://client.example/callback",
        client_id: readOnly.clientId,
        code_verifier: readOnly.verifier,
        resource: `${ORIGIN}/api/mcp`,
      },
    });
    const readAccess = (readToken.json as { access_token: string }).access_token;
    const escalated = await call(env.deps, "POST", "/api/v1/pages", {
      token: readAccess,
      body: { title: "no", content: "no" },
    });
    expect(escalated.status).toBe(403);

    seed(env.store, {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      userId: USER_A,
      title: "Mine",
      content: "cloud body",
    });
    const listed = await call(env.deps, "GET", "/api/v1/pages", { token: access });
    expect(listed.status).toBe(200);

    env.setNow(new Date("2026-10-20T14:00:00.000Z"));
    const stale = await call(env.deps, "GET", "/api/v1/pages", { token: access });
    expect(stale.status).toBe(401);
    const refreshed = await call(env.deps, "POST", "/api/oauth/token", {
      body: {
        grant_type: "refresh_token",
        refresh_token: refresh,
        client_id: flow.clientId,
        resource: `${ORIGIN}/api/mcp`,
      },
    });
    expect(refreshed.status).toBe(200);
    const nextAccess = (refreshed.json as { access_token: string }).access_token;
    const nextRefresh = (refreshed.json as { refresh_token: string }).refresh_token;
    expect((await call(env.deps, "GET", "/api/v1/pages", { token: nextAccess })).status).toBe(200);

    const replay = await call(env.deps, "POST", "/api/oauth/token", {
      body: { grant_type: "refresh_token", refresh_token: refresh, client_id: flow.clientId },
    });
    expect(replay.status).toBe(400);
    expect((await call(env.deps, "GET", "/api/v1/pages", { token: nextAccess })).status).toBe(401);
    expect((await call(env.deps, "POST", "/api/oauth/token", {
      body: { grant_type: "refresh_token", refresh_token: nextRefresh, client_id: flow.clientId },
    })).status).toBe(400);

    const apps = await call(env.deps, "GET", "/api/v1/oauth/grants", { session: "session-a" });
    const grants = (apps.json as { grants: Array<{ id: string; client_name: string }> }).grants;
    expect(grants.some((grant) => grant.client_name === "Claude")).toBe(true);
    const other = await call(env.deps, "POST", `/api/v1/oauth/grants/${grants[0]!.id}/revoke`, { session: "session-b" });
    expect(other.status).toBe(404);
  });

  it("serves discovery metadata and MCP tools for a bearer token", async () => {
    const env = harness();
    const unauth = await call(env.deps, "POST", "/api/mcp", {
      body: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } },
    });
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get("www-authenticate")).toContain('resource_metadata="http://localhost/.well-known/oauth-protected-resource"');
    expect(unauth.headers.get("access-control-allow-origin")).toBeNull();

    const resource = await call(env.deps, "GET", "/.well-known/oauth-protected-resource");
    expect((resource.json as { resource: string }).resource).toBe("http://localhost/api/mcp");
    expect((resource.json as { authorization_servers: string[] }).authorization_servers).toEqual(["http://localhost"]);
    const server = await call(env.deps, "GET", "/.well-known/oauth-authorization-server");
    const metadata = server.json as { code_challenge_methods_supported: string[]; registration_endpoint: string; authorization_endpoint: string };
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
    expect(metadata.registration_endpoint).toBe("http://localhost/api/oauth/register");
    expect(metadata.authorization_endpoint).toBe("http://localhost/oauth/authorize");

    const foreign = await call(env.deps, "POST", "/api/mcp", {
      headers: { origin: "https://evil.example" },
      body: { jsonrpc: "2.0", id: 1, method: "ping" },
    });
    expect(foreign.status).toBe(403);

    const token = await mintPat(env.deps, ["write"]);
    seed(env.store, {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      userId: USER_A,
      title: "Mine",
      content: "mcp body",
    });
    const init = await call(env.deps, "POST", "/api/mcp", {
      token: token.token,
      headers: { accept: "application/json, text/event-stream" },
      body: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } },
    });
    expect(init.status).toBe(200);
    expect(init.headers.get("content-type")).toContain("text/event-stream");
    expect(init.text).toContain("event: message");
    expect(init.text).toContain("wings");

    const tools = await call(env.deps, "POST", "/api/mcp", {
      token: token.token,
      headers: { accept: "application/json" },
      body: { jsonrpc: "2.0", id: 2, method: "tools/list" },
    });
    const names = ((tools.json as { result: { tools: Array<{ name: string }> } }).result.tools).map((tool) => tool.name);
    expect(names).toEqual([...MCP_TOOL_NAMES]);

    const read = await call(env.deps, "POST", "/api/mcp", {
      token: token.token,
      headers: { accept: "application/json" },
      body: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_page", arguments: { page_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } } },
    });
    expect(read.status).toBe(200);
    expect(JSON.stringify(read.json)).toContain("mcp body");
  });
});

describe("browser sources", () => {
  it("does not mention server-only secrets", () => {
    const roots = ["src/components", "src/pages", "src/hooks", "src/lib"];
    const banned = ["SUPABASE_SERVICE_ROLE_KEY", "API_TOKEN_PEPPER"];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
      }
    };
    for (const root of roots) walk(path.join(process.cwd(), root));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const secret of banned) {
        expect(text, file).not.toContain(secret);
      }
    }
  });
});
