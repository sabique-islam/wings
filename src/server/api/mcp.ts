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

const TOOLS = [
  {
    name: "list_pages",
    description: "List the user's own pages, including parent_id so you can rebuild the tree. Local-vault pages are included with server_readable false and no body. Use this to find a page id before reading or editing.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_page",
    description: "Read one page. Cloud pages include markdown in content. Local-vault pages return server_readable false and a message instead of a body; do not guess the body.",
    inputSchema: {
      type: "object",
      properties: { page_id: { type: "string" } },
      required: ["page_id"],
      additionalProperties: false,
    },
  },
  {
    name: "search_pages",
    description: "Search the user's own pages by title and, for cloud pages, body text. Results do not include page bodies. Local-vault pages match on title only.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", minLength: 1, maxLength: 200 } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "create_page",
    description: "Create a server-readable page, optionally under a parent you own. Requires the write scope. This cannot create a local-vault body.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        parent_id: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "update_page",
    description: "Replace a cloud page's markdown and/or title. Requires the write scope. Refuses to wipe a substantial page with empty content. Local-vault bodies cannot be changed.",
    inputSchema: {
      type: "object",
      properties: {
        page_id: { type: "string" },
        title: { type: "string" },
        content: { type: "string" },
        parent_id: { type: ["string", "null"] },
      },
      required: ["page_id"],
      additionalProperties: false,
    },
  },
  {
    name: "append_to_page",
    description: "Append markdown to a cloud page. Requires the write scope. Local-vault bodies cannot be changed.",
    inputSchema: {
      type: "object",
      properties: {
        page_id: { type: "string" },
        content: { type: "string" },
      },
      required: ["page_id", "content"],
      additionalProperties: false,
    },
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
      return rpcError(id, -32602, "Unknown tool");
    }
    if (service.authError === "insufficient_scope") return rpcError(id, -32001, "Forbidden");
    return toolResult(id, service);
  }
  return rpcError(id, -32601, "Method not found");
}

export const MCP_TOOL_NAMES = TOOLS.map((tool) => tool.name);
