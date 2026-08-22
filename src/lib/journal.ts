import { supabase } from "@/integrations/supabase/client";
import type { JSONContent } from "@tiptap/core";
import { isEmptyDoc } from "@/lib/editorContent";
import { EntryLayoutMap, normalizeLayout } from "./layout";
import { logError } from "./logger";
import { sortSiblings } from "./pageOrder";
import type { FullEditorChangePayload } from "./editorPayload";
import { payloadFromMarkdown } from "./entryContent";
import type { ContentStorage } from "@/lib/localContent";
import { normalizeContentStorage } from "@/lib/localContent";

export type { ContentStorage } from "@/lib/localContent";

export interface Entry {
  id: string;
  content: string;
  content_json: JSONContent | null;
  content_storage: ContentStorage;
  created_at: string;
  user_id: string;
  pinned: boolean;
  parent_id: string | null;
  title: string;
  share_token: string | null;
  layout: EntryLayoutMap;
  /** Client-side sidebar order; persisted only when the DB column exists. */
  sort_order: number | null;
  deleted_at: string | null;
}

export type ShareRole = "owner" | "admin" | "editor" | "viewer";

export interface MonthGroup {
  key: string;
  label: string;
  entries: Entry[];
}

export function groupByMonth(entries: Entry[]): MonthGroup[] {
  const map = new Map<string, Entry[]>();
  const sorted = sortSiblings(entries.filter((e) => !e.pinned));

  for (const e of sorted) {
    const d = new Date(e.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }

  return Array.from(map.entries()).map(([key, entries]) => {
    const [y, m] = key.split("-");
    const label = new Date(+y, +m - 1).toLocaleString("default", { month: "long", year: "numeric" });
    return { key, label, entries };
  });
}

export function getPinnedEntries(entries: Entry[]): Entry[] {
  return sortSiblings(entries.filter((e) => e.pinned));
}

export function getRootEntries(entries: Entry[]): Entry[] {
  return entries.filter((e) => !e.parent_id);
}

export function getChildEntries(entries: Entry[], parentId: string): Entry[] {
  return sortSiblings(entries.filter((e) => e.parent_id === parentId));
}

export function getBreadcrumbTrail(entries: Entry[], entryId: string): Entry[] {
  const trail: Entry[] = [];
  let current = entries.find((e) => e.id === entryId);
  while (current) {
    trail.unshift(current);
    current = current.parent_id ? entries.find((e) => e.id === current!.parent_id) : undefined;
  }
  return trail;
}

export function getEntryTitle(entry: Entry): string {
  return entry.title || entry.content.split("\n")[0].replace(/^#+\s*/, "").slice(0, 40) || "Untitled";
}

/** Max length stored in `entries.title` (matches the title field / update path). */
export const ENTRY_TITLE_MAX_LENGTH = 100;

/** Trim and cap a page name for the title column — never for a body heading. */
export function normalizeEntryTitle(title: string | null | undefined): string {
  return (title ?? "").trim().slice(0, ENTRY_TITLE_MAX_LENGTH);
}

/** True when the page has no saved title or body — a fresh "Untitled" draft. */
export function isBlankDraftPage(entry: Entry): boolean {
  if (entry.deleted_at) return false;
  if (entry.title.trim()) return false;
  if (entry.content.trim()) return false;
  return isEmptyDoc(entry.content_json);
}

/** Most recent empty untitled draft under the same parent, if any. */
export function findReusableBlankDraft(
  entries: Entry[],
  ownerId: string,
  parentId: string | null,
): Entry | null {
  const match = entries
    .filter((e) => e.user_id === ownerId && e.parent_id === parentId && isBlankDraftPage(e))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return match[0] ?? null;
}

/** Columns for entries the caller owns (includes share_token for ShareMenu / public link). */
const ENTRY_COLS_OWNER_LEGACY =
  "id, content, content_json, created_at, user_id, pinned, parent_id, title, share_token, layout, deleted_at";

/** Columns for entries shared with the caller — never include share_token. */
const ENTRY_COLS_SHARED_LEGACY =
  "id, content, content_json, created_at, user_id, pinned, parent_id, title, layout, deleted_at, properties, sort_order";

const ENTRY_COLS_OWNER =
  "id, content, content_json, content_storage, created_at, user_id, pinned, parent_id, title, share_token, layout, deleted_at";

const ENTRY_COLS_SHARED =
  "id, content, content_json, content_storage, created_at, user_id, pinned, parent_id, title, layout, deleted_at, properties, sort_order";

let contentStorageColumnKnown: boolean | null = null;
let contentStorageColumnPromise: Promise<boolean> | null = null;

function isMissingColumnError(error: { message?: string } | null, column: string): boolean {
  const msg = error?.message?.toLowerCase() ?? "";
  return msg.includes(column.toLowerCase()) && msg.includes("does not exist");
}

/** Probes once per session — local vault needs migration 20260808120000 applied. */
export async function contentStorageColumnAvailable(): Promise<boolean> {
  if (contentStorageColumnKnown !== null) return contentStorageColumnKnown;
  if (!contentStorageColumnPromise) {
    contentStorageColumnPromise = (async () => {
      const { error } = await supabase.from("entries").select("content_storage").limit(0);
      const available = !error || !isMissingColumnError(error, "content_storage");
      contentStorageColumnKnown = available;
      return available;
    })();
  }
  return contentStorageColumnPromise;
}

async function entryColsOwner(): Promise<string> {
  return (await contentStorageColumnAvailable()) ? ENTRY_COLS_OWNER : ENTRY_COLS_OWNER_LEGACY;
}

async function entryColsShared(): Promise<string> {
  return (await contentStorageColumnAvailable()) ? ENTRY_COLS_SHARED : ENTRY_COLS_SHARED_LEGACY;
}

export interface FetchedEntries {
  entries: Entry[];
  roleMap: Record<string, ShareRole>;
  /** Entries with at least one share row — the pages that use realtime collab. */
  sharedEntryIds: Set<string>;
}

export interface ShareWorkspacePayload {
  collaborators: Array<Record<string, unknown> & { role?: string }>;
  owned_shared_ids: string[];
}

function mapEntryRow(d: unknown): Entry {
  const row = d as Record<string, unknown>;
  return {
    id: String(row.id),
    content: String(row.content ?? ""),
    content_json: (row.content_json as JSONContent | null) ?? null,
    content_storage: normalizeContentStorage(row.content_storage),
    created_at: String(row.created_at),
    user_id: String(row.user_id),
    pinned: Boolean(row.pinned),
    parent_id: (row.parent_id as string | null) ?? null,
    title: String(row.title ?? ""),
    share_token: (row.share_token as string | null) ?? null,
    layout: normalizeLayout(row.layout),
    sort_order: row.sort_order == null ? null : Number(row.sort_order),
    deleted_at: (row.deleted_at as string | null) ?? null,
  };
}

/** Map server `fetch_share_workspace` JSON into sidebar/collab state. */
export function mapShareWorkspacePayload(
  payload: ShareWorkspacePayload,
): Pick<FetchedEntries, "entries" | "roleMap" | "sharedEntryIds"> {
  const roleMap: Record<string, ShareRole> = {};
  const sharedEntryIds = new Set<string>();
  const entries: Entry[] = [];

  for (const id of payload.owned_shared_ids) {
    if (id) sharedEntryIds.add(String(id));
  }

  for (const row of payload.collaborators) {
    const entry = mapEntryRow(row);
    entries.push(entry);
    sharedEntryIds.add(entry.id);
    if (row.role && row.role !== "owner") {
      roleMap[entry.id] = row.role as ShareRole;
    }
  }

  return { entries, roleMap, sharedEntryIds };
}

function parseShareWorkspaceJson(data: unknown): ShareWorkspacePayload {
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const collaborators = Array.isArray(obj.collaborators)
    ? (obj.collaborators as Array<Record<string, unknown> & { role?: string }>)
    : [];
  const ownedRaw = obj.owned_shared_ids;
  const owned_shared_ids = Array.isArray(ownedRaw)
    ? ownedRaw.map((id) => String(id)).filter(Boolean)
    : [];
  return { collaborators, owned_shared_ids };
}

async function fetchCollaboratorEntries(
  sharedIds: string[],
  includeTrash: boolean,
): Promise<Entry[]> {
  if (sharedIds.length === 0) return [];
  const { data, error } = await supabase.rpc("fetch_collaborator_entries", {
    _ids: sharedIds,
    _include_deleted: includeTrash,
  });
  if (!error) return (data ?? []).map(mapEntryRow);

  const rpcMissing =
    error.code === "PGRST202" ||
    (error.message?.includes("fetch_collaborator_entries") ?? false);
  if (!rpcMissing) {
    logError("Failed to fetch collaborator entries", error);
    return [];
  }

  let sharedQuery = supabase.from("entries").select(await entryColsShared()).in("id", sharedIds);
  if (!includeTrash) sharedQuery = sharedQuery.is("deleted_at", null);
  const { data: legacy, error: legacyError } = await sharedQuery;
  if (legacyError) {
    logError("Failed to fetch collaborator entries (legacy)", legacyError);
    return [];
  }
  return (legacy ?? []).map(mapEntryRow);
}

/** Legacy path when `fetch_share_workspace` is not deployed yet. */
async function fetchShareWorkspaceLegacy(
  userId: string,
  opts: { includeTrash?: boolean },
): Promise<Pick<FetchedEntries, "entries" | "roleMap" | "sharedEntryIds">> {
  const roleMap: Record<string, ShareRole> = {};
  const sharedEntryIds = new Set<string>();

  const { data, error } = await supabase.rpc("list_my_shares");
  let shareRows: Array<{ entry_id: string; role: string; shared_with_user_id: string | null }> = [];
  if (!error) {
    shareRows = (data ?? []) as typeof shareRows;
  } else {
    const rpcMissing =
      error.code === "PGRST202" || (error.message?.includes("list_my_shares") ?? false);
    if (!rpcMissing) {
      logError("Failed to fetch share bootstrap rows", error);
      return { entries: [], roleMap, sharedEntryIds };
    }
    const { data: legacy, error: legacyError } = await supabase
      .from("entry_shares")
      .select("entry_id, role, shared_with_user_id");
    if (legacyError) {
      logError("Failed to fetch share bootstrap rows (legacy)", legacyError);
      return { entries: [], roleMap, sharedEntryIds };
    }
    shareRows = (legacy ?? []) as typeof shareRows;
  }

  shareRows.forEach((s) => sharedEntryIds.add(s.entry_id));
  const sharedWithUser = shareRows.filter((s) => s.shared_with_user_id === userId);
  sharedWithUser.forEach((s) => {
    roleMap[s.entry_id] = s.role as ShareRole;
  });
  const sharedEntries = await fetchCollaboratorEntries(
    sharedWithUser.map((s) => s.entry_id),
    !!opts.includeTrash,
  );

  return {
    entries: sharedEntries,
    roleMap,
    sharedEntryIds,
  };
}

export interface FetchEntriesOptions {
  includeTrash?: boolean;
  /** When false, only owned pages are fetched (shared/collab state stays client-side). */
  includeShares?: boolean;
}

export interface WorkspaceMetaSnapshot {
  sharedEntryIds: string[];
  roleMap: Record<string, ShareRole>;
}

function ownerRoleMap(ownEntries: Entry[]): Record<string, ShareRole> {
  const roleMap: Record<string, ShareRole> = {};
  ownEntries.forEach((e) => {
    roleMap[e.id] = "owner";
  });
  return roleMap;
}

/** Replace owned pages from a server fetch while keeping collaborator pages from cache. */
export function mergeOwnEntriesWithShared(
  previous: Entry[],
  ownEntries: Entry[],
  userId: string,
): Entry[] {
  const shared = previous.filter((e) => e.user_id !== userId);
  const seen = new Set<string>();
  const merged: Entry[] = [];
  for (const entry of [...ownEntries, ...shared]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }
  return merged;
}

export async function fetchOwnEntries(
  userId: string,
  opts: { includeTrash?: boolean } = {},
): Promise<Entry[]> {
  let query = supabase
    .from("entries")
    .select(await entryColsOwner())
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (!opts.includeTrash) query = query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) {
    logError("Failed to fetch own entries", error);
    throw error;
  }
  return (data ?? []).map(mapEntryRow);
}

async function fetchShareWorkspace(
  userId: string,
  opts: { includeTrash?: boolean },
): Promise<Pick<FetchedEntries, "entries" | "roleMap" | "sharedEntryIds">> {
  const { data, error } = await supabase.rpc("fetch_share_workspace", {
    _include_deleted: !!opts.includeTrash,
  });

  if (!error) {
    return mapShareWorkspacePayload(parseShareWorkspaceJson(data));
  }

  const rpcMissing =
    error.code === "PGRST202" || (error.message?.includes("fetch_share_workspace") ?? false);
  if (!rpcMissing) {
    logError("Failed to fetch share workspace", error);
    return { entries: [], roleMap: {}, sharedEntryIds: new Set() };
  }

  return fetchShareWorkspaceLegacy(userId, opts);
}

function mergeFetchedEntries(ownEntries: Entry[], share: Pick<FetchedEntries, "entries" | "roleMap" | "sharedEntryIds">): FetchedEntries {
  const roleMap = { ...ownerRoleMap(ownEntries), ...share.roleMap };
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const entry of [...ownEntries, ...share.entries]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return { entries, roleMap, sharedEntryIds: share.sharedEntryIds };
}

/** Full workspace fetch — own pages plus share bootstrap (sidebar, collab flags). */
export async function fetchEntries(userId: string, opts: FetchEntriesOptions = {}): Promise<FetchedEntries> {
  const includeShares = opts.includeShares ?? true;
  const ownEntries = await fetchOwnEntries(userId, opts);
  if (!includeShares) {
    return {
      entries: ownEntries,
      roleMap: ownerRoleMap(ownEntries),
      sharedEntryIds: new Set<string>(),
    };
  }

  try {
    const share = await fetchShareWorkspace(userId, opts);
    return mergeFetchedEntries(ownEntries, share);
  } catch (err) {
    logError("Failed to fetch shared entries", err);
    return {
      entries: ownEntries,
      roleMap: ownerRoleMap(ownEntries),
      sharedEntryIds: new Set<string>(),
    };
  }
}

/**
 * Reconcile own pages from the server and always refresh Shared-with-me /
 * outbound share flags (cheap indexed RPC; skipping caused sticky invisibility).
 */
export async function syncWorkspaceEntries(
  userId: string,
  _meta: WorkspaceMetaSnapshot | null,
  previousEntries: Entry[],
  opts: { includeTrash?: boolean; refreshShares?: boolean } = {},
): Promise<FetchedEntries> {
  const ownEntries = await fetchOwnEntries(userId, opts);

  try {
    const share = await fetchShareWorkspace(userId, opts);
    return mergeFetchedEntries(ownEntries, share);
  } catch (err) {
    logError("Failed to fetch shared entries", err);
    return {
      entries: mergeOwnEntriesWithShared(previousEntries, ownEntries, userId),
      roleMap: ownerRoleMap(ownEntries),
      sharedEntryIds: new Set(_meta?.sharedEntryIds ?? []),
    };
  }
}

export async function fetchTrash(userId: string): Promise<Entry[]> {
  const { data, error } = await supabase
    .from("entries")
    .select(await entryColsOwner())
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) {
    logError("Failed to fetch trash", error);
    return [];
  }
  return (data ?? []).map(mapEntryRow);
}

export interface CreateEntryOptions {
  parentId?: string;
  storage?: ContentStorage;
  initialJson?: JSONContent | null;
  /** Page name for `entries.title`. Do not put this in the body as `# heading`. */
  title?: string;
}

export async function createEntry(
  userId: string,
  content: string,
  parentIdOrOpts?: string | CreateEntryOptions,
  maybeOpts?: CreateEntryOptions,
): Promise<Entry> {
  let parentId: string | undefined;
  let opts: CreateEntryOptions = {};
  if (typeof parentIdOrOpts === "string") {
    parentId = parentIdOrOpts;
    opts = maybeOpts ?? {};
  } else {
    opts = parentIdOrOpts ?? {};
    parentId = opts.parentId;
  }
  const storage = opts.storage ?? "cloud";
  const title = normalizeEntryTitle(opts.title);
  const hasStorageColumn = await contentStorageColumnAvailable();
  if (storage === "local" && !hasStorageColumn) {
    throw new Error(
      "Local pages require a database update. Apply the content_storage migration in Supabase, then reload.",
    );
  }
  const serverContent = storage === "local" ? "" : content;
  const insert = {
    user_id: userId,
    content: serverContent,
    ...(parentId ? { parent_id: parentId } : {}),
    ...(title ? { title } : {}),
    ...(storage === "local" ? { content_json: null } : {}),
    ...(hasStorageColumn ? { content_storage: storage } : {}),
  };
  const { data, error } = await supabase
    .from("entries")
    .insert(insert)
    .select(await entryColsOwner())
    .single();
  if (error) throw error;
  if (!data) throw new Error("Failed to create page");
  const row = mapEntryRow(data);
  if (storage === "local" && content.trim()) {
    const json = opts.initialJson ?? payloadFromMarkdown(content).json;
    return { ...row, content, content_json: json };
  }
  return row;
}

export async function updateEntry(id: string, payload: FullEditorChangePayload): Promise<void> {
  /**
   * Content updates use PostgREST UPDATE without RETURNING / `.select()`.
   *
   * Entry reads are split by role: owners SELECT their rows; collaborators
   * read through RPC (`fetch_share_workspace`, `fetch_collaborator_entries`)
   * so `share_token` never crosses the client boundary. Collaborators still
   * have an UPDATE policy on `entries` for `content` / `content_json`.
   *
   * PostgREST only returns rows the caller may SELECT. A `.select()` after
   * UPDATE therefore looks like failure for shared editors even when the write
   * succeeded. Treat a null `error` as success; failed RLS/policy violations
   * surface as PostgREST errors.
   */
  const { error } = await supabase
    .from("entries")
    .update({ content: payload.markdown, content_json: payload.json })
    .eq("id", id);
  if (error) throw error;
}

export async function entryHasShares(entryId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("entry_shares")
    .select("id", { count: "exact", head: true })
    .eq("entry_id", entryId);
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function updateEntryTitle(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("entries")
    .update({ title: normalizeEntryTitle(title) })
    .eq("id", id);
  if (error) throw error;
}

/** No-op until `sort_order` migration is applied in Supabase. */
export async function saveEntryOrder(_order: Array<{ id: string; sort_order: number }>): Promise<void> {
  return;
}

export async function moveEntry(id: string, parentId: string | null): Promise<void> {
  const { error } = await supabase.from("entries").update({ parent_id: parentId }).eq("id", id);
  if (error) throw error;
}

export async function togglePin(id: string, pinned: boolean): Promise<void> {
  const { error } = await supabase.from("entries").update({ pinned }).eq("id", id);
  if (error) throw error;
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from("entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreEntry(id: string): Promise<void> {
  const { error } = await supabase.from("entries").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

export async function permanentlyDeleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from("entries").delete().eq("id", id);
  if (error) throw error;
}

export async function searchEntries(userId: string, q: string, limit = 20): Promise<Entry[]> {
  const query = q.trim();
  if (!query) return [];
  let request = supabase
    .from("entries")
    .select(await entryColsOwner())
    .eq("user_id", userId)
    .is("deleted_at", null)
    .textSearch("search_tsv", query, { type: "websearch", config: "english" })
    .limit(limit);
  if (await contentStorageColumnAvailable()) {
    request = request.eq("content_storage", "cloud");
  }
  const { data, error } = await request;
  if (error) {
    logError("Search failed", error);
    return [];
  }
  return (data ?? []).map(mapEntryRow);
}
