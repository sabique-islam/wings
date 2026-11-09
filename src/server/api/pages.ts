import { shouldBlockEmptySave } from "../../lib/emptySave.js";
import {
  COLLAB_BODY_MESSAGE,
  LOCAL_BODY_MESSAGE,
  StoreError,
  type ApiDeps,
  type PageRow,
  type Principal,
  type ServiceResult,
} from "./types.js";
import {
  hasScope,
  isUuid,
  LIMITS,
  normalizeTitle,
} from "./validate.js";

/** Empty doc so resolveInitialEditorContent keeps the markdown the API just wrote. */
export const EMPTY_DOC: { type: "doc"; content: never[] } = { type: "doc", content: [] };

function result(status: number, body: unknown, authError?: ServiceResult["authError"]): ServiceResult {
  return authError ? { status, body, authError } : { status, body };
}

function need(principal: Principal, scope: "read" | "write"): ServiceResult | null {
  if (hasScope(principal.scopes, scope)) return null;
  return result(403, { error: "This connection only has read access. Reconnect Wings with write access to create or edit pages." }, "insufficient_scope");
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

const LOCAL_WRITE_MESSAGE = "This page is stored in the local vault. The API cannot change its body.";

/** Body writes are refused for local-vault pages and for pages the collab server owns. */
async function bodyWriteBlocked(deps: ApiDeps, principal: Principal, existing: PageRow): Promise<ServiceResult | null> {
  if (existing.contentStorage !== "cloud") return result(409, { error: LOCAL_WRITE_MESSAGE });
  if (await deps.store.hasCollabState(principal.userId, existing.id)) {
    deps.log("collab_write_blocked", { pageId: existing.id });
    return result(409, { error: COLLAB_BODY_MESSAGE });
  }
  return null;
}

/**
 * Keep the page's current body in version history before the API replaces it,
 * so an assistant's edit can be undone from Version History. Throws (503, body
 * untouched) when the restore point cannot be saved.
 */
async function saveRestorePoint(deps: ApiDeps, principal: Principal, existing: PageRow): Promise<void> {
  if (!existing.content.trim()) return;
  await deps.store.recordVersion({
    entryId: existing.id,
    authorId: principal.userId,
    content: existing.content,
    contentJson: existing.contentJson ?? null,
  });
}

/**
 * Snapshot what the API wrote, as the editor does after its own saves, so a
 * browser tab that later saves over it does not erase it. Best effort: the
 * write already succeeded.
 */
async function recordWrittenVersion(deps: ApiDeps, principal: Principal, row: PageRow): Promise<void> {
  if (!row.content.trim()) return;
  try {
    await deps.store.recordVersion({
      entryId: row.id,
      authorId: principal.userId,
      content: row.content,
      contentJson: null,
    });
  } catch {
    deps.log("version_after_write_failed", { pageId: row.id });
  }
}

/** Body update matched no row: it went local or gained collab state after we read it. */
async function bodyWriteRaced(deps: ApiDeps, principal: Principal, id: string): Promise<ServiceResult> {
  const message = (await deps.store.hasCollabState(principal.userId, id)) ? COLLAB_BODY_MESSAGE : LOCAL_WRITE_MESSAGE;
  return result(409, { error: message });
}

function appendMarkdown(existing: string, addition: string): string {
  const base = existing.trimEnd();
  const extra = addition.trim();
  if (!extra) return base;
  return base ? `${base}\n\n${extra}` : extra;
}

async function ownedParent(deps: ApiDeps, userId: string, parentId: string | null, pageId?: string): Promise<ServiceResult | null> {
  if (!parentId) return null;
  if (!isUuid(parentId)) return result(400, { error: "parent_id must be a page id (uuid) or null." });
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
  if (!isUuid(id)) return result(404, { error: "No page with that id in this account. It may be in the trash, or the id may be wrong." });
  const row = await deps.store.getPage(principal.userId, id);
  if (!row) return result(404, { error: "No page with that id in this account. It may be in the trash, or the id may be wrong." });
  return result(200, pageBody(row));
}

export async function searchPages(deps: ApiDeps, principal: Principal, url: URL): Promise<ServiceResult> {
  const denied = need(principal, "read");
  if (denied) return denied;
  const query = (url.searchParams.get("q") ?? "").replace(/\u0000/g, "").trim();
  if (!query || query.length > LIMITS.search) return result(400, { error: "query must be 1 to 200 characters." });
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
  if (title == null) return result(400, { error: "title must be text." });
  const content = body.content == null ? "" : body.content;
  if (typeof content !== "string" || content.length > LIMITS.content) return result(400, { error: "content must be markdown text of at most 500,000 characters." });
  let parentId: string | null = null;
  if (body.parent_id != null && body.parent_id !== "") {
    if (typeof body.parent_id !== "string") return result(400, { error: "parent_id must be a page id (uuid) or null." });
    parentId = body.parent_id;
  }
  const parentError = await ownedParent(deps, principal.userId, parentId);
  if (parentError) return parentError;
  const row = await deps.store.createPage({
    userId: principal.userId,
    title,
    content,
    contentJson: EMPTY_DOC,
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
  if (!isUuid(id)) return result(404, { error: "No page with that id in this account. It may be in the trash, or the id may be wrong." });
  const existing = await deps.store.getPage(principal.userId, id);
  if (!existing) return result(404, { error: "No page with that id in this account. It may be in the trash, or the id may be wrong." });

  const hasContent = Object.prototype.hasOwnProperty.call(body, "content");
  const hasTitle = Object.prototype.hasOwnProperty.call(body, "title");
  const hasParent = Object.prototype.hasOwnProperty.call(body, "parent_id");
  if (!hasContent && !hasTitle && !hasParent) return result(400, { error: "Send at least one of content, title, or parent_id." });

  if (hasContent) {
    const blocked = await bodyWriteBlocked(deps, principal, existing);
    if (blocked) return blocked;
  }

  let title: string | undefined;
  if (hasTitle) {
    if (typeof body.title !== "string") return result(400, { error: "title must be text." });
    title = normalizeTitle(body.title);
  }

  let content: string | undefined;
  if (hasContent) {
    if (typeof body.content !== "string" || body.content.length > LIMITS.content) return result(400, { error: "content must be markdown text of at most 500,000 characters." });
    if (shouldBlockEmptySave(existing.content, body.content)) {
      deps.log("empty_save_blocked", { pageId: id });
      return result(400, { error: "Refusing to replace a page with empty content." });
    }
    content = body.content;
  }

  let parentId: string | null | undefined;
  if (hasParent) {
    parentId = body.parent_id == null || body.parent_id === "" ? null : String(body.parent_id);
    if (parentId != null && typeof body.parent_id !== "string") return result(400, { error: "parent_id must be a page id (uuid) or null." });
    const parentError = await ownedParent(deps, principal.userId, parentId, id);
    if (parentError) return parentError;
  }

  if (content !== undefined) {
    await saveRestorePoint(deps, principal, existing);
    const row = await deps.store.updatePage(
      principal.userId,
      id,
      { title, content, contentJson: EMPTY_DOC, parentId },
      "body",
    );
    if (!row) return bodyWriteRaced(deps, principal, id);
    await recordWrittenVersion(deps, principal, row);
    deps.log("page_update", { pageId: id });
    return result(200, pageBody(row));
  }

  const row = await deps.store.updatePage(principal.userId, id, { title, parentId }, "meta");
  if (!row) return result(404, { error: "No page with that id in this account. It may be in the trash, or the id may be wrong." });
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
  if (!isUuid(id)) return result(404, { error: "No page with that id in this account. It may be in the trash, or the id may be wrong." });
  if (typeof body.content !== "string" || !body.content.trim() || body.content.length > LIMITS.content) {
    return result(400, { error: "content must be non-empty markdown of at most 500,000 characters." });
  }
  const existing = await deps.store.getPage(principal.userId, id);
  if (!existing) return result(404, { error: "No page with that id in this account. It may be in the trash, or the id may be wrong." });
  const blocked = await bodyWriteBlocked(deps, principal, existing);
  if (blocked) return blocked;
  const next = appendMarkdown(existing.content, body.content);
  if (next.length > LIMITS.content) return result(413, { error: "The page would be longer than 500,000 characters after appending." });
  if (shouldBlockEmptySave(existing.content, next)) {
    deps.log("empty_save_blocked", { pageId: id });
    return result(400, { error: "Refusing to replace a page with empty content." });
  }
  // Appending rewrites content_json to an empty doc, so the editor's JSON is kept as a restore point too.
  await saveRestorePoint(deps, principal, existing);
  const row = await deps.store.updatePage(
    principal.userId,
    id,
    { content: next, contentJson: EMPTY_DOC },
    "body",
  );
  if (!row) return bodyWriteRaced(deps, principal, id);
  await recordWrittenVersion(deps, principal, row);
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
