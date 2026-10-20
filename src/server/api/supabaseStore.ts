import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { StoreError, type ApiStore, type PageRow } from "./types";
import type { Scope } from "./validate";

type Row = Record<string, unknown>;

const PAGE_META = "id, user_id, title, parent_id, content_storage, created_at, updated_at, deleted_at";
const PAGE_BODY = `${PAGE_META}, content`;

function asScope(value: unknown): Scope[] {
  const list = Array.isArray(value) ? value : [];
  const scopes: Scope[] = [];
  if (list.includes("read")) scopes.push("read");
  if (list.includes("write")) scopes.push("write");
  if (scopes.includes("write") && !scopes.includes("read")) scopes.unshift("read");
  return scopes.includes("read") ? scopes : ["read"];
}

function mapPage(row: Row, content = ""): PageRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: String(row.title ?? ""),
    parentId: (row.parent_id as string | null) ?? null,
    content,
    contentStorage: row.content_storage === "local" ? "local" : "cloud",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: (row.deleted_at as string | null) ?? null,
  };
}

function fail(): never {
  throw new StoreError();
}

export function createSupabaseStore(client: SupabaseClient): ApiStore {
  return {
    async listPages(userId, limit, offset) {
      const { data, error } = await client
        .from("entries")
        .select(PAGE_META)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) fail();
      return (data ?? []).map((row) => mapPage(row as Row));
    },

    async getPage(userId, id) {
      const { data, error } = await client
        .from("entries")
        .select(PAGE_BODY)
        .eq("user_id", userId)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) fail();
      if (!data) return null;
      const row = data as Row;
      return mapPage(row, String(row.content ?? ""));
    },

    async searchPages(userId, query, limit) {
      const { data, error } = await client
        .from("entries")
        .select(PAGE_META)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .textSearch("search_tsv", query, { type: "websearch", config: "english" })
        .limit(limit);
      if (error) fail();
      return (data ?? []).map((row) => mapPage(row as Row));
    },

    async createPage(input) {
      const { data, error } = await client
        .from("entries")
        .insert({
          user_id: input.userId,
          title: input.title,
          content: input.content,
          content_json: input.contentJson,
          content_storage: "cloud",
          parent_id: input.parentId,
        })
        .select(PAGE_BODY)
        .single();
      if (error || !data) fail();
      const row = data as Row;
      return mapPage(row, String(row.content ?? ""));
    },

    async updatePage(userId, id, patch, mode) {
      const dbPatch: Record<string, unknown> = {};
      if (patch.title !== undefined) dbPatch.title = patch.title;
      if (patch.parentId !== undefined) dbPatch.parent_id = patch.parentId;
      if (mode === "body" && patch.content !== undefined) {
        dbPatch.content = patch.content;
        dbPatch.content_json = patch.contentJson;
      }
      let query = client.from("entries").update(dbPatch).eq("id", id).eq("user_id", userId).is("deleted_at", null);
      if (mode === "body") query = query.eq("content_storage", "cloud");
      const { data, error } = await query.select(PAGE_BODY).maybeSingle();
      if (error) fail();
      if (!data) return null;
      const row = data as Row;
      return mapPage(row, String(row.content ?? ""));
    },

    async listPats(userId) {
      const { data, error } = await client
        .from("api_tokens")
        .select("id, user_id, name, token_prefix, secret_hash, scopes, created_at, last_used_at, expires_at, revoked_at")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) fail();
      return (data ?? []).map(mapPat);
    },

    async countActivePats(userId) {
      const { count, error } = await client
        .from("api_tokens")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("revoked_at", null);
      if (error) fail();
      return count ?? 0;
    },

    async insertPat(row) {
      const { error } = await client.from("api_tokens").insert({
        id: row.id,
        user_id: row.userId,
        name: row.name,
        token_prefix: row.tokenPrefix,
        secret_hash: row.secretHash,
        scopes: row.scopes,
        created_at: row.createdAt,
        expires_at: row.expiresAt,
      });
      if (error) fail();
    },

    async getPat(id) {
      const { data, error } = await client.from("api_tokens").select("*").eq("id", id).maybeSingle();
      if (error) fail();
      return data ? mapPat(data as Row) : null;
    },

    async revokePat(userId, id, at) {
      const { data, error } = await client
        .from("api_tokens")
        .update({ revoked_at: at })
        .eq("id", id)
        .eq("user_id", userId)
        .is("revoked_at", null)
        .select("id");
      if (error) fail();
      return (data ?? []).length > 0;
    },

    async touchPat(id, at) {
      const { error } = await client.from("api_tokens").update({ last_used_at: at }).eq("id", id);
      if (error) fail();
    },

    async insertClient(row) {
      const { error } = await client.from("oauth_clients").insert({
        id: row.id,
        client_name: row.name,
        redirect_uris: row.redirectUris,
        created_at: row.createdAt,
      });
      if (error) fail();
    },

    async getClient(id) {
      const { data, error } = await client.from("oauth_clients").select("*").eq("id", id).maybeSingle();
      if (error) fail();
      if (!data) return null;
      const row = data as Row;
      return {
        id: String(row.id),
        name: String(row.client_name),
        redirectUris: (row.redirect_uris as string[]) ?? [],
        createdAt: String(row.created_at),
      };
    },

    async insertGrant(row) {
      const { error } = await client.from("oauth_grants").insert({
        id: row.id,
        user_id: row.userId,
        client_id: row.clientId,
        scopes: row.scopes,
        created_at: row.createdAt,
        last_used_at: row.lastUsedAt,
      });
      if (error) fail();
    },

    async listGrants(userId) {
      const { data, error } = await client
        .from("oauth_grants")
        .select("*")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) fail();
      return (data ?? []).map((row) => mapGrant(row as Row));
    },

    async findActiveGrant(userId, clientId) {
      const { data, error } = await client
        .from("oauth_grants")
        .select("*")
        .eq("user_id", userId)
        .eq("client_id", clientId)
        .is("revoked_at", null)
        .limit(1)
        .maybeSingle();
      if (error) fail();
      return data ? mapGrant(data as Row) : null;
    },

    async getGrant(id) {
      const { data, error } = await client.from("oauth_grants").select("*").eq("id", id).maybeSingle();
      if (error) fail();
      return data ? mapGrant(data as Row) : null;
    },

    async updateGrantScopes(id, scopes, at) {
      const { error } = await client.from("oauth_grants").update({ scopes, last_used_at: at }).eq("id", id);
      if (error) fail();
    },

    async revokeGrant(userId, id, at) {
      const { data, error } = await client
        .from("oauth_grants")
        .update({ revoked_at: at })
        .eq("id", id)
        .eq("user_id", userId)
        .is("revoked_at", null)
        .select("id");
      if (error) fail();
      if ((data ?? []).length === 0) return false;
      const access = await client.from("oauth_access_tokens").update({ revoked_at: at }).eq("grant_id", id).is("revoked_at", null);
      const refresh = await client.from("oauth_refresh_tokens").update({ revoked_at: at }).eq("grant_id", id).is("revoked_at", null);
      if (access.error || refresh.error) fail();
      return true;
    },

    async touchGrant(id, at) {
      const { error } = await client.from("oauth_grants").update({ last_used_at: at }).eq("id", id);
      if (error) fail();
    },

    async insertCode(row) {
      const { error } = await client.from("oauth_codes").insert({
        id: row.id,
        user_id: row.userId,
        client_id: row.clientId,
        grant_id: row.grantId,
        redirect_uri: row.redirectUri,
        scopes: row.scopes,
        code_hash: row.codeHash,
        code_challenge: row.codeChallenge,
        resource: row.resource,
        expires_at: row.expiresAt,
      });
      if (error) fail();
    },

    async consumeCode(id, at) {
      const { data, error } = await client
        .from("oauth_codes")
        .update({ used_at: at })
        .eq("id", id)
        .is("used_at", null)
        .gt("expires_at", at)
        .select("*")
        .maybeSingle();
      if (error) fail();
      return data ? mapCode(data as Row) : null;
    },

    async insertAccess(row) {
      const { error } = await client.from("oauth_access_tokens").insert(accessInsert(row));
      if (error) fail();
    },

    async getAccess(id) {
      const { data, error } = await client.from("oauth_access_tokens").select("*").eq("id", id).maybeSingle();
      if (error) fail();
      return data ? mapAccess(data as Row) : null;
    },

    async revokeAccessForGrant(grantId, at) {
      const { error } = await client
        .from("oauth_access_tokens")
        .update({ revoked_at: at })
        .eq("grant_id", grantId)
        .is("revoked_at", null);
      if (error) fail();
    },

    async touchAccess(id, at) {
      const { error } = await client.from("oauth_access_tokens").update({ last_used_at: at }).eq("id", id);
      if (error) fail();
    },

    async insertRefresh(row) {
      const { error } = await client.from("oauth_refresh_tokens").insert({
        ...accessInsert(row),
        replaced_by: row.replacedBy,
      });
      if (error) fail();
    },

    async getRefresh(id) {
      const { data, error } = await client.from("oauth_refresh_tokens").select("*").eq("id", id).maybeSingle();
      if (error) fail();
      return data ? mapRefresh(data as Row) : null;
    },

    async rotateRefresh(id, at, replacementId) {
      const { data, error } = await client
        .from("oauth_refresh_tokens")
        .update({ revoked_at: at, replaced_by: replacementId })
        .eq("id", id)
        .is("revoked_at", null)
        .gt("expires_at", at)
        .select("*")
        .maybeSingle();
      if (error) fail();
      return data ? mapRefresh(data as Row) : null;
    },

    async revokeRefreshForGrant(grantId, at) {
      const { error } = await client
        .from("oauth_refresh_tokens")
        .update({ revoked_at: at })
        .eq("grant_id", grantId)
        .is("revoked_at", null);
      if (error) fail();
    },

    async hitRateLimit(bucket, windowSeconds, limit) {
      const { data, error } = await client.rpc("api_rate_hit", {
        p_bucket: bucket,
        p_window_seconds: windowSeconds,
        p_limit: limit,
      });
      if (error) fail();
      return { allowed: data === true };
    },
  };
}

function mapPat(row: Row) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    tokenPrefix: String(row.token_prefix),
    secretHash: String(row.secret_hash),
    scopes: asScope(row.scopes),
    createdAt: String(row.created_at),
    lastUsedAt: (row.last_used_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
  };
}

function mapGrant(row: Row) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    clientId: String(row.client_id),
    scopes: asScope(row.scopes),
    createdAt: String(row.created_at),
    revokedAt: (row.revoked_at as string | null) ?? null,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
  };
}

function mapCode(row: Row) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    clientId: String(row.client_id),
    grantId: String(row.grant_id),
    redirectUri: String(row.redirect_uri),
    scopes: asScope(row.scopes),
    codeHash: String(row.code_hash),
    codeChallenge: String(row.code_challenge),
    resource: String(row.resource),
    expiresAt: String(row.expires_at),
    usedAt: (row.used_at as string | null) ?? null,
  };
}

function mapAccess(row: Row) {
  return {
    id: String(row.id),
    grantId: String(row.grant_id),
    userId: String(row.user_id),
    secretHash: String(row.secret_hash),
    tokenPrefix: String(row.token_prefix),
    scopes: asScope(row.scopes),
    resource: String(row.resource),
    expiresAt: String(row.expires_at),
    revokedAt: (row.revoked_at as string | null) ?? null,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
  };
}

function mapRefresh(row: Row) {
  return {
    ...mapAccess(row),
    replacedBy: (row.replaced_by as string | null) ?? null,
  };
}

function accessInsert(row: {
  id: string;
  grantId: string;
  userId: string;
  secretHash: string;
  tokenPrefix: string;
  scopes: Scope[];
  resource: string;
  expiresAt: string;
}) {
  return {
    id: row.id,
    grant_id: row.grantId,
    user_id: row.userId,
    secret_hash: row.secretHash,
    token_prefix: row.tokenPrefix,
    scopes: row.scopes,
    resource: row.resource,
    expires_at: row.expiresAt,
  };
}

export function createServiceClient(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
