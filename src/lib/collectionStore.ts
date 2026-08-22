import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  parseCollectionRules,
  type CollectionInfo,
  type FilterParams,
} from "./collections";
import {
  deleteCachedCollection,
  putCachedCollection,
  readCachedCollections,
  replaceCachedCollections,
} from "./localStore";
import { logError } from "./logger";

let tableKnown: boolean | null = null;
let tableProbe: Promise<boolean> | null = null;

function isMissingTableError(error: { message?: string; code?: string } | null): boolean {
  const msg = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    (msg.includes("collections") && (msg.includes("does not exist") || msg.includes("schema cache")))
  );
}

async function collectionsTableAvailable(): Promise<boolean> {
  if (tableKnown !== null) return tableKnown;
  if (!tableProbe) {
    tableProbe = (async () => {
      const { error } = await supabase.from("collections").select("id").limit(0);
      const available = !error || !isMissingTableError(error);
      tableKnown = available;
      return available;
    })();
  }
  return tableProbe;
}

function rulesJson(rules: CollectionInfo["rules"]): Json {
  return JSON.parse(JSON.stringify(rules)) as Json;
}

function mapRow(row: {
  id: string;
  name: string;
  rules: unknown;
  allow_list: string[] | null;
}): CollectionInfo {
  return {
    id: row.id,
    name: row.name,
    rules: parseCollectionRules(row.rules),
    allowList: Array.isArray(row.allow_list) ? row.allow_list.map(String) : [],
  };
}

export async function fetchCollections(userId: string): Promise<CollectionInfo[]> {
  const cached = await readCachedCollections(userId);
  if (!(await collectionsTableAvailable())) return cached;

  const { data, error } = await supabase
    .from("collections")
    .select("id, name, rules, allow_list")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      tableKnown = false;
      return cached;
    }
    logError("Failed to fetch collections", error);
    return cached;
  }

  const collections = (data ?? []).map(mapRow);
  await replaceCachedCollections(userId, collections);
  return collections;
}

export async function createCollection(
  userId: string,
  input: { name: string; rules?: { filters: FilterParams[] }; allowList?: string[] },
): Promise<CollectionInfo> {
  const name = input.name.trim();
  if (!name) throw new Error("Collection name is required");
  const rules = input.rules ?? { filters: [] };
  const allowList = input.allowList ?? [];

  if (await collectionsTableAvailable()) {
    const { data, error } = await supabase
      .from("collections")
      .insert({
        user_id: userId,
        name,
        rules: rulesJson(rules),
        allow_list: allowList,
      })
      .select("id, name, rules, allow_list")
      .single();
    if (!error && data) {
      const created = mapRow(data);
      await putCachedCollection(userId, created);
      return created;
    }
    if (error && !isMissingTableError(error)) throw error;
    tableKnown = false;
  }

  const created: CollectionInfo = {
    id: crypto.randomUUID(),
    name,
    rules,
    allowList,
  };
  await putCachedCollection(userId, created);
  return created;
}

export async function updateCollection(
  userId: string,
  id: string,
  patch: Partial<Pick<CollectionInfo, "name" | "rules" | "allowList">>,
): Promise<CollectionInfo> {
  const current = (await readCachedCollections(userId)).find((row) => row.id === id);
  const next: CollectionInfo = {
    id,
    name: patch.name?.trim() || current?.name || "Untitled",
    rules: patch.rules ?? current?.rules ?? { filters: [] },
    allowList: patch.allowList ?? current?.allowList ?? [],
  };
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new Error("Collection name is required");
  }

  if (await collectionsTableAvailable()) {
    const { data, error } = await supabase
      .from("collections")
      .update({
        name: next.name,
        rules: rulesJson(next.rules),
        allow_list: next.allowList,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, name, rules, allow_list")
      .maybeSingle();
    if (!error && data) {
      const saved = mapRow(data);
      await putCachedCollection(userId, saved);
      return saved;
    }
    if (error && !isMissingTableError(error)) throw error;
    if (error && isMissingTableError(error)) tableKnown = false;
  }

  await putCachedCollection(userId, next);
  return next;
}

export async function deleteCollection(userId: string, id: string): Promise<void> {
  if (await collectionsTableAvailable()) {
    const { error } = await supabase.from("collections").delete().eq("id", id).eq("user_id", userId);
    if (error && !isMissingTableError(error)) throw error;
    if (error && isMissingTableError(error)) tableKnown = false;
  }
  await deleteCachedCollection(id);
}

export async function addPagesToCollection(
  userId: string,
  collection: CollectionInfo,
  entryIds: string[],
): Promise<CollectionInfo> {
  const allowList = [...new Set([...collection.allowList, ...entryIds])];
  return updateCollection(userId, collection.id, { allowList });
}
