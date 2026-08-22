// IndexedDB mirror of the workspace.
//
// Reads paint from here before Supabase answers, and writes land here before
// the network is attempted. Supabase stays authoritative: this store is a cache
// plus an outbox, never the last word on a conflict.
//
// Every operation degrades to a no-op when IndexedDB is unavailable (private
// windows, jsdom, storage denied) so no caller has to branch on support.

import Dexie, { type Table } from "dexie";
import type { JSONContent } from "@tiptap/core";
import type { CollectionInfo } from "./collections";
import type { Entry, ShareRole } from "./journal";
import { isLocalEntry } from "./localContent";

/** Cached server row, tagged with the account whose fetch produced it. */
export interface CachedEntry extends Entry {
  cacheOwnerId: string;
  cachedAt: number;
}

/**
 * Share state from the last server fetch. Cached because the editor cannot
 * learn it after mounting — switching TipTap into collaborative mode means
 * discarding the editor the user is typing in.
 */
export interface WorkspaceMetaRow {
  userId: string;
  roleMap: Record<string, ShareRole>;
  sharedEntryIds: string[];
  fetchedAt: number;
}

export interface DraftRow {
  entryId: string;
  markdown: string;
  json: JSONContent | null;
  updatedAt: number;
}

export interface PendingWriteRow {
  entryId: string;
  content: string;
  contentJson: JSONContent | null;
  timestamp: number;
}

export interface LinkIndexRow {
  entryId: string;
  /** Ids of pages this page links to. */
  outgoing: string[];
  /** Wikilink titles that don't resolve to an existing page yet. */
  unresolved: string[];
  /** Hashtags found in this page's content. */
  tags: string[];
  /** Target page id to the sentence it was linked from, shown as a backlink snippet. */
  contexts?: Record<string, string>;
  updatedAt: number;
}

export interface GraphStateRow {
  userId: string;
  mode: "global" | "local";
  depth: 1 | 2 | 3;
  filters: { hideUnlinked: boolean; orphansOnly: boolean; tag: string | null };
  positions: Record<string, { x: number; y: number }>;
  viewport: { scale: number; offsetX: number; offsetY: number } | null;
  updatedAt: number;
}

export interface CachedCollection extends CollectionInfo {
  cacheOwnerId: string;
}

export interface VaultMetaRow {
  userId: string;
  folderName: string;
  connectedAt: number;
  handle: FileSystemDirectoryHandle | null;
  lastWrittenAt: Record<string, number>;
  lastWrittenHash: Record<string, string>;
  /** Where each page was last written, so renames can clean up the old file. */
  lastWrittenPath?: Record<string, string>;
  /** Why the last automatic mirror failed, so the folder can't look in sync when it isn't. */
  lastError?: { message: string; at: number } | null;
}

class WingsDatabase extends Dexie {
  entries!: Table<CachedEntry, string>;
  meta!: Table<WorkspaceMetaRow, string>;
  drafts!: Table<DraftRow, string>;
  pendingWrites!: Table<PendingWriteRow, string>;
  linkIndex!: Table<LinkIndexRow, string>;
  graphState!: Table<GraphStateRow, string>;
  vaultMeta!: Table<VaultMetaRow, string>;
  collections!: Table<CachedCollection, string>;

  constructor() {
    super("wings");
    this.version(1).stores({
      entries: "id, cacheOwnerId",
      meta: "userId",
      drafts: "entryId",
      pendingWrites: "entryId",
      linkIndex: "entryId, *outgoing",
    });
    this.version(2)
      .stores({
        entries: "id, cacheOwnerId",
        meta: "userId",
        drafts: "entryId",
        pendingWrites: "entryId",
        linkIndex: "entryId, *outgoing",
        graphState: "userId",
        vaultMeta: "userId",
      })
      .upgrade(async (tx) => {
        await tx
          .table("linkIndex")
          .toCollection()
          .modify((row: LinkIndexRow) => {
            if (!row.tags) row.tags = [];
          });
      });
    this.version(3).stores({
      entries: "id, cacheOwnerId",
      meta: "userId",
      drafts: "entryId",
      pendingWrites: "entryId",
      linkIndex: "entryId, *outgoing",
      graphState: "userId",
      vaultMeta: "userId",
      collections: "id, cacheOwnerId",
    });
  }
}

let database: WingsDatabase | null | undefined;

/** Null when IndexedDB is missing or refused to open. */
function db(): WingsDatabase | null {
  if (database !== undefined) return database;
  try {
    database = typeof indexedDB === "undefined" ? null : new WingsDatabase();
  } catch {
    database = null;
  }
  return database;
}

export function isLocalStoreAvailable(): boolean {
  return db() !== null;
}

/** Storage failures must never surface as app errors — the server still has the data. */
async function guard<T>(work: (instance: WingsDatabase) => Promise<T>, fallback: T): Promise<T> {
  const instance = db();
  if (!instance) return fallback;
  try {
    return await work(instance);
  } catch (err) {
    console.warn("[wings] local store unavailable", err);
    return fallback;
  }
}

function toCached(entry: Entry, cacheOwnerId: string): CachedEntry {
  return { ...entry, cacheOwnerId, cachedAt: Date.now() };
}

function toEntry({ cacheOwnerId: _owner, cachedAt: _at, ...entry }: CachedEntry): Entry {
  return { ...entry, sort_order: entry.sort_order ?? null };
}

/** Entries last mirrored for this account, newest first. */
export function readCachedEntries(userId: string): Promise<Entry[]> {
  return guard(async (instance) => {
    const rows = await instance.entries.where("cacheOwnerId").equals(userId).toArray();
    return rows
      .map(toEntry)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, []);
}

/**
 * Replace cached rows from a server fetch, preserving local entry bodies when the
 * server stub is empty.
 */
export function mergeCachedEntries(userId: string, incoming: Entry[]): Promise<void> {
  return guard(async (instance) => {
    const existing = await instance.entries.where("cacheOwnerId").equals(userId).toArray();
    const existingById = new Map(existing.map((row) => [row.id, toEntry(row)]));
    const merged = incoming.map((row) => {
      if (!isLocalEntry(row)) return row;
      const prev = existingById.get(row.id);
      if (row.content.trim().length > 0) return row;
      if (prev && prev.content.trim().length > 0) {
        return { ...row, content: prev.content, content_json: prev.content_json ?? row.content_json };
      }
      return row;
    });
    const keep = new Set(merged.map((e) => e.id));
    await instance.transaction("rw", instance.entries, async () => {
      const stale = await instance.entries.where("cacheOwnerId").equals(userId).primaryKeys();
      await instance.entries.bulkDelete(stale.filter((id) => !keep.has(id)));
      await instance.entries.bulkPut(merged.map((e) => toCached(e, userId)));
    });
  }, undefined);
}

/** @deprecated Prefer mergeCachedEntries for workspace sync. */
export function replaceCachedEntries(userId: string, entries: Entry[]): Promise<void> {
  return mergeCachedEntries(userId, entries);
}

export function putCachedEntry(userId: string, entry: Entry): Promise<void> {
  return guard(async (instance) => {
    await instance.entries.put(toCached(entry, userId));
  }, undefined);
}

export function deleteCachedEntries(ids: string[]): Promise<void> {
  return guard(async (instance) => {
    await instance.entries.bulkDelete(ids);
  }, undefined);
}

export function readWorkspaceMeta(userId: string): Promise<WorkspaceMetaRow | null> {
  return guard(async (instance) => (await instance.meta.get(userId)) ?? null, null);
}

export function putWorkspaceMeta(row: WorkspaceMetaRow): Promise<void> {
  return guard(async (instance) => {
    await instance.meta.put(row);
  }, undefined);
}

export function readAllDrafts(): Promise<DraftRow[]> {
  return guard((instance) => instance.drafts.toArray(), []);
}

export function putDraftRow(row: DraftRow): Promise<void> {
  return guard(async (instance) => {
    await instance.drafts.put(row);
  }, undefined);
}

export function deleteDraftRow(entryId: string): Promise<void> {
  return guard(async (instance) => {
    await instance.drafts.delete(entryId);
  }, undefined);
}

export function readPendingWriteRows(): Promise<PendingWriteRow[]> {
  return guard((instance) => instance.pendingWrites.toArray(), []);
}

export function putPendingWriteRow(row: PendingWriteRow): Promise<void> {
  return guard(async (instance) => {
    await instance.pendingWrites.put(row);
  }, undefined);
}

export function deletePendingWriteRow(entryId: string): Promise<void> {
  return guard(async (instance) => {
    await instance.pendingWrites.delete(entryId);
  }, undefined);
}

export function readLinkIndex(): Promise<LinkIndexRow[]> {
  return guard((instance) => instance.linkIndex.toArray(), []);
}

export function putLinkIndexRows(rows: LinkIndexRow[]): Promise<void> {
  return guard(async (instance) => {
    await instance.linkIndex.bulkPut(rows);
  }, undefined);
}

export function deleteLinkIndexRow(entryId: string): Promise<void> {
  return guard(async (instance) => {
    await instance.linkIndex.delete(entryId);
  }, undefined);
}

export function readGraphState(userId: string): Promise<GraphStateRow | null> {
  return guard(async (instance) => (await instance.graphState.get(userId)) ?? null, null);
}

export function putGraphState(row: GraphStateRow): Promise<void> {
  return guard(async (instance) => {
    await instance.graphState.put(row);
  }, undefined);
}

export function readVaultMeta(userId: string): Promise<VaultMetaRow | null> {
  return guard(async (instance) => (await instance.vaultMeta.get(userId)) ?? null, null);
}

export function putVaultMeta(row: VaultMetaRow): Promise<void> {
  return guard(async (instance) => {
    await instance.vaultMeta.put(row);
  }, undefined);
}

export function deleteVaultMeta(userId: string): Promise<void> {
  return guard(async (instance) => {
    await instance.vaultMeta.delete(userId);
  }, undefined);
}

function toCachedCollection(collection: CollectionInfo, cacheOwnerId: string): CachedCollection {
  return { ...collection, cacheOwnerId };
}

function toCollectionInfo({ cacheOwnerId: _owner, ...collection }: CachedCollection): CollectionInfo {
  return collection;
}

export function readCachedCollections(userId: string): Promise<CollectionInfo[]> {
  return guard(async (instance) => {
    const rows = await instance.collections.where("cacheOwnerId").equals(userId).toArray();
    return rows.map(toCollectionInfo);
  }, []);
}

export function replaceCachedCollections(userId: string, collections: CollectionInfo[]): Promise<void> {
  return guard(async (instance) => {
    const keep = new Set(collections.map((row) => row.id));
    await instance.transaction("rw", instance.collections, async () => {
      const stale = await instance.collections.where("cacheOwnerId").equals(userId).primaryKeys();
      await instance.collections.bulkDelete(stale.filter((id) => !keep.has(id)));
      await instance.collections.bulkPut(collections.map((row) => toCachedCollection(row, userId)));
    });
  }, undefined);
}

export function putCachedCollection(userId: string, collection: CollectionInfo): Promise<void> {
  return guard(async (instance) => {
    await instance.collections.put(toCachedCollection(collection, userId));
  }, undefined);
}

export function deleteCachedCollection(id: string): Promise<void> {
  return guard(async (instance) => {
    await instance.collections.delete(id);
  }, undefined);
}
