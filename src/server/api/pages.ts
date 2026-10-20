import { shouldBlockEmptySave } from "../../lib/editorContent";
import { LOCAL_BODY_MESSAGE, StoreError, type ApiDeps, type PageRow, type Principal, type ServiceResult } from "./types";
import {
  hasScope,
  isUuid,
  LIMITS,
  normalizeTitle,
} from "./validate";

/** Empty doc so resolveInitialEditorContent keeps the markdown the API just wrote. */
export const EMPTY_DOC: { type: "doc"; content: never[] } = { type: "doc", content: [] };

function result(status: number, body: unknown, authError?: ServiceResult["authError"]): ServiceResult {
  return authError ? { status, body, authError } : { status, body };
}

function need(principal: Principal, scope: "read" | "write"): ServiceResult | null {
  if (hasScope(principal.scopes, scope)) return null;
  return result(403, { error: "Forbidden" }, "insufficient_scope");
}

export function pageMeta(row: PageRow) {
  return {
    id: row.id,
    title: row.title,
    parent_id: row.parentId,
    content_storage: row.contentStorage,
    server_readable: row.contentStorage === "cloud",
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function pageBody(row: PageRow) {
  if (row.contentStorage !== "cloud") {
    return {
      ...pageMeta(row),
      message: LOCAL_BODY_MESSAGE,
    };
  }
  return {
    ...pageMeta(row),
    content: row.content,
  };
}

function appendMarkdown(existing: string, addition: string): string {
  const base = existing.trimEnd();
  const extra = addition.trim();
  if (!extra) return base;
  return base ? `${base}\n\n${extra}` : extra;
}

async function ownedParent(deps: ApiDeps, userId: string, parentId: string | null, pageId?: string): Promise<ServiceResult | null> {
  if (!parentId) return null;
  if (!isUuid(parentId)) return result(400, { error: "Bad request" });
  if (pageId && parentId === pageId) return result(400, { error: "A page cannot be placed inside itself." });
  let cursor: string | null = parentId;
  for (let depth = 0; depth < 50 && cursor; depth++) {
    if (pageId && cursor === pageId) return result(400, { error: "A page cannot be placed inside itself." });
    const parent = await deps.store.getPage(userId, cursor);
    if (!parent) return result(400, { error: "Parent page was not found." });
    cursor = parent.parentId;
  }
  return null;
}

export async function listPages(deps: ApiDeps, principal: Principal, url: URL): Promise<ServiceResult> {
  const denied = need(principal, "read");
  if (denied) return denied;
  const limit = clampInt(url.searchParams.get("limit"), 100, 1, 200);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 5000);
  const rows = await deps.store.listPages(principal.userId, limit, offset);
  return result(200, { pages: rows.map(pageMeta) });
}

export async function getPage(deps: ApiDeps, principal: Principal, id: string): Promise<ServiceResult> {
  const denied = need(principal, "read");
  if (denied) return denied;
  if (!isUuid(id)) return result(404, { error: "Not found" });
  const row = await deps.store.getPage(principal.userId, id);
  if (!row) return result(404, { error: "Not found" });
  return result(200, pageBody(row));
}

export async function searchPages(deps: ApiDeps, principal: Principal, url: URL): Promise<ServiceResult> {
  const denied = need(principal, "read");
  if (denied) return denied;
  const query = (url.searchParams.get("q") ?? "").replace(/\u0000/g, "").trim();
  if (!query || query.length > LIMITS.search) return result(400, { error: "Bad request" });
  const limit = clampInt(url.searchParams.get("limit"), 20, 1, 50);
  const rows = await deps.store.searchPages(principal.userId, query, limit);
  return result(200, { pages: rows.map(pageMeta) });
}

export async function createPage(deps: ApiDeps, principal: Principal, body: Record<string, unknown>): Promise<ServiceResult> {
  const denied = need(principal, "write");
  if (denied) return denied;
  if (body.storage === "local" || body.content_storage === "local") {
    return result(400, { error: "The API only creates server-readable pages. Local vault bodies stay on the device." });
  }
  const title = body.title == null ? "" : typeof body.title === "string" ? normalizeTitle(body.title) : null;
  if (title == null) return result(400, { error: "Bad request" });
  const content = body.content == null ? "" : body.content;
  if (typeof content !== "string" || content.length > LIMITS.content) return result(400, { error: "Bad request" });
  const parentId = body.parent_id == null || body.parent_id === "" ? null : body.parent_id;
  if (parentId != null && typeof parentId !== "string") return result(400, { error: "Bad request" });
  const parentError = await ownedParent(deps, principal.userId, parentId);
  if (parentError) return parentError;
  const row = await deps.store.createPage({
    userId: principal.userId,
    title,
    content,
    contentJson: content.trim() ? EMPTY_DOC : EMPTY_DOC,
    parentId,
  });
  deps.log("page_create", { pageId: row.id });
  return result(201, pageBody(row));
}

export async function updatePage(
  deps: ApiDeps,
  principal: Principal,
  id: string,
  body: Record<string, unknown>,
): Promise<ServiceResult> {
  const denied = need(principal, "write");
  if (denied) return denied;
  if (!isUuid(id)) return result(404, { error: "Not found" });
  const existing = await deps.store.getPage(principal.userId, id);
  if (!existing) return result(404, { error: "Not found" });

  const hasContent = Object.prototype.hasOwnProperty.call(body, "content");
  const hasTitle = Object.prototype.hasOwnProperty.call(body, "title");
  const hasParent = Object.prototype.hasOwnProperty.call(body, "parent_id");
  if (!hasContent && !hasTitle && !hasParent) return result(400, { error: "Bad request" });

  if (hasContent && existing.contentStorage !== "cloud") {
    return result(409, { error: "This page is stored in the local vault. The API cannot change its body." });
  }

  let title: string | undefined;
  if (hasTitle) {
    if (typeof body.title !== "string") return result(400, { error: "Bad request" });
    title = normalizeTitle(body.title);
  }

  let content: string | undefined;
  if (hasContent) {
    if (typeof body.content !== "string" || body.content.length > LIMITS.content) return result(400, { error: "Bad request" });
    if (shouldBlockEmptySave(existing.content, body.content)) {
      deps.log("empty_save_blocked", { pageId: id });
      return result(400, { error: "Refusing to replace a page with empty content." });
    }
    content = body.content;
  }

  let parentId: string | null | undefined;
  if (hasParent) {
    parentId = body.parent_id == null || body.parent_id === "" ? null : String(body.parent_id);
    if (parentId != null && typeof body.parent_id !== "string") return result(400, { error: "Bad request" });
    const parentError = await ownedParent(deps, principal.userId, parentId, id);
    if (parentError) return parentError;
  }

  if (content !== undefined) {
    const row = await deps.store.updatePage(
      principal.userId,
      id,
      { title, content, contentJson: EMPTY_DOC, parentId },
      "body",
    );
    if (!row) return result(409, { error: "This page is stored in the local vault. The API cannot change its body." });
    deps.log("page_update", { pageId: id });
    return result(200, pageBody(row));
  }

  const row = await deps.store.updatePage(principal.userId, id, { title, parentId }, "meta");
  if (!row) return result(404, { error: "Not found" });
  deps.log("page_update", { pageId: id });
  return result(200, pageBody(row));
}

export async function appendPage(
  deps: ApiDeps,
  principal: Principal,
  id: string,
  body: Record<string, unknown>,
): Promise<ServiceResult> {
  const denied = need(principal, "write");
  if (denied) return denied;
  if (!isUuid(id)) return result(404, { error: "Not found" });
  if (typeof body.content !== "string" || !body.content.trim() || body.content.length > LIMITS.content) {
    return result(400, { error: "Bad request" });
  }
  const existing = await deps.store.getPage(principal.userId, id);
  if (!existing) return result(404, { error: "Not found" });
  if (existing.contentStorage !== "cloud") {
    return result(409, { error: "This page is stored in the local vault. The API cannot change its body." });
  }
  const next = appendMarkdown(existing.content, body.content);
  if (next.length > LIMITS.content) return result(413, { error: "Payload too large" });
  if (shouldBlockEmptySave(existing.content, next)) {
    deps.log("empty_save_blocked", { pageId: id });
    return result(400, { error: "Refusing to replace a page with empty content." });
  }
  const row = await deps.store.updatePage(
    principal.userId,
    id,
    { content: next, contentJson: EMPTY_DOC },
    "body",
  );
  if (!row) return result(409, { error: "This page is stored in the local vault. The API cannot change its body." });
  deps.log("page_append", { pageId: id });
  return result(200, pageBody(row));
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  if (value == null || value === "") return fallback;
  if (!/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function isStoreError(error: unknown): error is StoreError {
  return error instanceof StoreError;
}
