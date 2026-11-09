import {
  appendPage,
  createPage,
  getPage,
  listPages,
  searchPages,
  updatePage,
} from "./pages";
import type { ApiDeps, Principal, ServiceResult } from "./types";

const SERVER_PROTOCOL = "2025-06-18";
const SUPPORTED_PROTOCOLS = new Set(["2025-03-26", "2025-06-18"]);

const PAGE_ID = { type: "string", description: "Page id (uuid) from list_pages or search_pages." } as const;

/**
 * Annotations are explicit booleans on every tool, as the ChatGPT plugin
 * guidelines require. All tools only touch the signed-in user's own workspace,
 * so openWorldHint is false throughout.
 */
const TOOLS = [
  {
    name: "list_pages",
    title: "List pages",
    description: "List the user's own pages, newest edit first, with id, title, parent_id (to rebuild the page tree), and created_at / updated_at so you can answer questions about recent pages. Local-vault pages are included with server_readable false and no body. Use this to find a page id before reading or editing. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Pages to return. Default 100." },
        offset: { type: "integer", minimum: 0, maximum: 5000, description: "Pages to skip, for paging. Default 0." },
      },
      additionalProperties: false,
    },
    annotations: { title: "List pages", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_page",
    title: "Read page",
    description: "Read one of the user's pages. Cloud pages include their markdown in content. Local-vault pages return server_readable false and a message instead of a body; do not guess the body. Read-only.",
    inputSchema: {
      type: "object",
      properties: { page_id: PAGE_ID },
      required: ["page_id"],
      additionalProperties: false,
    },
    annotations: { title: "Read page", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "search_pages",
    title: "Search pages",
    description: "Full-text search over the user's own pages: titles, and body text for cloud pages. Returns matching page ids and titles, not bodies; call get_page to read one. Local-vault pages match on title only. Read-only.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", minLength: 1, maxLength: 200, description: "Words to search for." } },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { title: "Search pages", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "create_page",
    title: "Create page",
    description: "Create a new cloud page from markdown, optionally under a parent page the user owns. Requires the write scope. Not safe to retry: each call creates another page, so check list_pages before retrying after an error. This cannot create a local-vault page.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 100, description: "Page title. Optional." },
        content: { type: "string", description: "Page body as markdown. Optional." },
        parent_id: { ...PAGE_ID, description: "Put the new page under this page. Optional." },
      },
      additionalProperties: false,
    },
    annotations: { title: "Create page", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "update_page",
    title: "Replace page",
    description: "Overwrite a cloud page's markdown, and/or rename or move it. Requires the write scope. content replaces the whole body; to add text without removing any, use append_to_page instead. The previous body is saved in the page's version history so the user can restore it. Refuses to replace a substantial page with empty content. Local-vault bodies and pages with live collaboration history cannot be changed; tell the user to edit those in Wings. Repeating the same call leaves the page in the same state.",
    inputSchema: {
      type: "object",
      properties: {
        page_id: PAGE_ID,
        title: { type: "string", maxLength: 100, description: "New title. Omit to keep the current one." },
        content: { type: "string", description: "New full body as markdown. Omit to keep the current body." },
        parent_id: { type: ["string", "null"], description: "Move under this page id, or null for the top level. Omit to keep the current place." },
      },
      required: ["page_id"],
      additionalProperties: false,
    },
    annotations: { title: "Replace page", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "append_to_page",
    title: "Append to page",
    description: "Add markdown to the end of a cloud page without removing anything. Requires the write scope. Not safe to retry: each call appends again, so read the page with get_page before retrying after an error. The previous body is saved in version history. Local-vault bodies and pages with live collaboration history cannot be changed.",
    inputSchema: {
      type: "object",
      properties: {
        page_id: PAGE_ID,
        content: { type: "string", minLength: 1, description: "Markdown to add at the end of the page." },
      },
      required: ["page_id", "content"],
      additionalProperties: false,
    },
    annotations: { title: "Append to page", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
] as const;

export function wantsSse(accept: string | null): boolean {
  return Boolean(accept && accept.includes("text/event-stream"));
}

export function mcpHttpResponse(payload: unknown, accept: string | null, status = 200): Response {
  const headers = new Headers({
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  if (wantsSse(accept)) {
    const events = Array.isArray(payload) ? payload : [payload];
    const body = events.map((event) => `event: message\ndata: ${JSON.stringify(event)}\n\n`).join("");
    headers.set("content-type", "text/event-stream");
    return new Response(body, { status, headers });
  }
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { status, headers });
}

interface RpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function toolResult(id: unknown, service: ServiceResult) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: JSON.stringify(service.body) }],
      isError: service.status >= 400,
    },
  };
}

export async function handleMcp(
  deps: ApiDeps,
  principal: Principal,
  body: unknown,
  accept: string | null,
  origin: string,
): Promise<Response> {
  if (Array.isArray(body)) {
    const responses = [];
    for (const item of body.slice(0, 20)) {
      const response = await oneMessage(deps, principal, item, origin);
      if (response) responses.push(response);
    }
    if (responses.length === 0) return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
    return mcpHttpResponse(responses, accept);
  }
  const response = await oneMessage(deps, principal, body, origin);
  if (!response) return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
  const status = response && typeof response === "object" && "error" in response && (response.error as { code?: number }).code === -32001
    ? 403
    : 200;
  return mcpHttpResponse(response, accept, status);
}

async function oneMessage(deps: ApiDeps, principal: Principal, raw: unknown, origin: string) {
  if (!raw || typeof raw !== "object") return rpcError(null, -32600, "Invalid request");
  const message = raw as RpcMessage;
  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return hasId ? rpcError(message.id, -32600, "Invalid request") : rpcError(null, -32600, "Invalid request");
  }
  if (!hasId) {
    if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return null;
    return null;
  }
  const id = message.id;
  if (message.method === "initialize") {
    const params = (message.params ?? {}) as { protocolVersion?: string };
    const protocol = SUPPORTED_PROTOCOLS.has(params.protocolVersion ?? "") ? params.protocolVersion : SERVER_PROTOCOL;
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: protocol,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "wings", version: "1.0.0" },
        instructions: "Pages you own are available with these tools. Local-vault pages have server_readable false and no body. Write tools need the write scope. Do not invent page bodies that the tools did not return.",
      },
    };
  }
  if (message.method === "ping" || message.method === "logging/setLevel") {
    return { jsonrpc: "2.0", id, result: {} };
  }
  if (message.method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }
  if (message.method === "tools/call") {
    const params = (message.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
    const url = new URL(`${origin}/api/mcp`);
    let service: ServiceResult;
    if (params.name === "list_pages") {
      if (args.limit != null) url.searchParams.set("limit", String(args.limit));
      if (args.offset != null) url.searchParams.set("offset", String(args.offset));
      service = await listPages(deps, principal, url);
    } else if (params.name === "get_page") {
      service = await getPage(deps, principal, String(args.page_id ?? ""));
    } else if (params.name === "search_pages") {
      url.searchParams.set("q", String(args.query ?? ""));
      service = await searchPages(deps, principal, url);
    } else if (params.name === "create_page") {
      service = await createPage(deps, principal, args);
    } else if (params.name === "update_page") {
      service = await updatePage(deps, principal, String(args.page_id ?? ""), args);
    } else if (params.name === "append_to_page") {
      service = await appendPage(deps, principal, String(args.page_id ?? ""), args);
    } else {
      return rpcError(id, -32602, `Unknown tool. Available tools: ${MCP_TOOL_NAMES.join(", ")}.`);
    }
    if (service.authError === "insufficient_scope") return rpcError(id, -32001, "This connection only has read access. Reconnect Wings with write access to create or edit pages.");
    return toolResult(id, service);
  }
  return rpcError(id, -32601, "Method not found");
}

export const MCP_TOOL_NAMES = TOOLS.map((tool) => tool.name);
