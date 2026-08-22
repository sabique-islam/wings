import type { JSONContent } from "@tiptap/core";
import type { Entry, ShareRole } from "@/lib/journal";
import { createEntry } from "@/lib/journal";
import { payloadFromMarkdown } from "@/lib/entryContent";
import type { DefaultContentStorage, ContentStorage } from "@/lib/localContent";
import { isLocalEntry, saveLocalContent } from "@/lib/localContent";
import { getVaultMeta } from "@/lib/vault/store";

export interface StorageChoiceContext {
  userDefault: DefaultContentStorage;
  parentEntry?: Entry | null;
  /** Collaborator-owned tree — cloud only. */
  forceCloud?: boolean;
  /** Vault import / new file without wings_id. */
  forceLocal?: boolean;
}

export interface StorageChoiceResult {
  storage: ContentStorage;
  /** When true, caller should persist the picked default to user_preferences. */
  remember?: DefaultContentStorage;
}

export function resolveStorageChoice(ctx: StorageChoiceContext): ContentStorage | "ask" {
  if (ctx.forceCloud) return "cloud";
  if (ctx.forceLocal) return "local";
  if (ctx.parentEntry && isLocalEntry(ctx.parentEntry)) return "local";
  if (ctx.userDefault === "ask") return "ask";
  return ctx.userDefault === "local" ? "local" : "cloud";
}

export async function isVaultConnected(userId: string): Promise<boolean> {
  const meta = await getVaultMeta(userId);
  return Boolean(meta?.handle);
}

export function canCreateLocalStorage(
  userId: string | null,
  storage: ContentStorage,
  vaultConnected: boolean,
): { ok: true } | { ok: false; reason: "vault" | "auth" } {
  if (storage !== "local") return { ok: true };
  if (!userId) return { ok: false, reason: "auth" };
  if (!vaultConnected) return { ok: false, reason: "vault" };
  return { ok: true };
}

/** Shared pages are always cloud — collaborators never own local vault bodies. */
export function mustUseCloudStorage(
  parentEntry: Entry | null | undefined,
  roleMap: Record<string, ShareRole>,
  ownerId: string,
): boolean {
  if (!parentEntry) return false;
  if (parentEntry.user_id === ownerId) return false;
  const role = roleMap[parentEntry.id];
  return role != null && role !== "owner";
}

export interface CreatePageParams {
  userId: string;
  ownerId: string;
  parentId?: string | null;
  initialContent?: string;
  /** Stored on `entries.title`, not as a leading heading in the body. */
  title?: string;
  storage: ContentStorage;
  allEntries: Entry[];
}

export async function executeCreatePage(params: CreatePageParams): Promise<Entry> {
  const initialContent = params.initialContent ?? "";
  const entry = await createEntry(params.ownerId, params.storage === "local" ? "" : initialContent, {
    parentId: params.parentId ?? undefined,
    storage: params.storage,
    title: params.title,
  });
  if (params.storage !== "local") return entry;

  const payload = initialContent.trim()
    ? payloadFromMarkdown(initialContent)
    : { markdown: "", json: { type: "doc", content: [] } as JSONContent };
  const withBody: Entry = { ...entry, content: payload.markdown, content_json: payload.json };
  await saveLocalContent(params.userId, withBody, [withBody, ...params.allEntries], payload);
  return withBody;
}
