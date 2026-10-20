import type {
  AccessRow,
  ApiStore,
  ClientRow,
  CodeRow,
  GrantRow,
  PageRow,
  PatRow,
  RefreshRow,
} from "./types";
import type { Scope } from "./validate";

function pageCopy(row: PageRow): PageRow {
  return { ...row };
}

export function createMemoryStore(now: () => Date = () => new Date()): ApiStore & {
  pages: Map<string, PageRow>;
} {
  const pages = new Map<string, PageRow>();
  const pats = new Map<string, PatRow>();
  const clients = new Map<string, ClientRow>();
  const grants = new Map<string, GrantRow>();
  const codes = new Map<string, CodeRow>();
  const access = new Map<string, AccessRow>();
  const refresh = new Map<string, RefreshRow>();
  const buckets = new Map<string, { start: number; count: number }>();

  function visible(row: PageRow | undefined, userId: string): PageRow | null {
    if (!row || row.userId !== userId || row.deletedAt) return null;
    return row;
  }

  return {
    pages,

    async listPages(userId, limit, offset) {
      return [...pages.values()]
        .filter((row) => row.userId === userId && !row.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(offset, offset + limit)
        .map(pageCopy);
    },

    async getPage(userId, id) {
      const row = visible(pages.get(id), userId);
      return row ? pageCopy(row) : null;
    },

    async searchPages(userId, query, limit) {
      const needle = query.toLowerCase();
      return [...pages.values()]
        .filter((row) => {
          if (row.userId !== userId || row.deletedAt) return false;
          if (row.title.toLowerCase().includes(needle)) return true;
          return row.contentStorage === "cloud" && row.content.toLowerCase().includes(needle);
        })
        .slice(0, limit)
        .map(pageCopy);
    },

    async createPage(input) {
      const at = now().toISOString();
      const row: PageRow = {
        id: crypto.randomUUID(),
        userId: input.userId,
        title: input.title,
        parentId: input.parentId,
        content: input.content,
        contentStorage: "cloud",
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
      };
      pages.set(row.id, row);
      return pageCopy(row);
    },

    async updatePage(userId, id, patch, mode) {
      const row = visible(pages.get(id), userId);
      if (!row) return null;
      if (mode === "body" && row.contentStorage !== "cloud") return null;
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.parentId !== undefined) row.parentId = patch.parentId;
      if (mode === "body" && patch.content !== undefined) row.content = patch.content;
      row.updatedAt = now().toISOString();
      return pageCopy(row);
    },

    async listPats(userId) {
      return [...pats.values()].filter((row) => row.userId === userId && !row.revokedAt);
    },

    async countActivePats(userId) {
      return [...pats.values()].filter((row) => row.userId === userId && !row.revokedAt).length;
    },

    async insertPat(row) {
      pats.set(row.id, { ...row, scopes: [...row.scopes] });
    },

    async getPat(id) {
      const row = pats.get(id);
      return row ? { ...row, scopes: [...row.scopes] as Scope[] } : null;
    },

    async revokePat(userId, id, at) {
      const row = pats.get(id);
      if (!row || row.userId !== userId || row.revokedAt) return false;
      row.revokedAt = at;
      return true;
    },

    async touchPat(id, at) {
      const row = pats.get(id);
      if (row) row.lastUsedAt = at;
    },

    async insertClient(row) {
      clients.set(row.id, { ...row, redirectUris: [...row.redirectUris] });
    },

    async getClient(id) {
      const row = clients.get(id);
      return row ? { ...row, redirectUris: [...row.redirectUris] } : null;
    },

    async insertGrant(row) {
      grants.set(row.id, { ...row, scopes: [...row.scopes] });
    },

    async listGrants(userId) {
      return [...grants.values()].filter((row) => row.userId === userId && !row.revokedAt);
    },

    async findActiveGrant(userId, clientId) {
      const row = [...grants.values()].find(
        (grant) => grant.userId === userId && grant.clientId === clientId && !grant.revokedAt,
      );
      return row ? { ...row, scopes: [...row.scopes] } : null;
    },

    async getGrant(id) {
      const row = grants.get(id);
      return row ? { ...row, scopes: [...row.scopes] } : null;
    },

    async updateGrantScopes(id, scopes, at) {
      const row = grants.get(id);
      if (!row) return;
      row.scopes = [...scopes];
      row.lastUsedAt = at;
    },

    async revokeGrant(userId, id, at) {
      const row = grants.get(id);
      if (!row || row.userId !== userId || row.revokedAt) return false;
      row.revokedAt = at;
      for (const token of access.values()) {
        if (token.grantId === id && !token.revokedAt) token.revokedAt = at;
      }
      for (const token of refresh.values()) {
        if (token.grantId === id && !token.revokedAt) token.revokedAt = at;
      }
      return true;
    },

    async touchGrant(id, at) {
      const row = grants.get(id);
      if (row) row.lastUsedAt = at;
    },

    async insertCode(row) {
      codes.set(row.id, { ...row, scopes: [...row.scopes] });
    },

    async consumeCode(id, at) {
      const row = codes.get(id);
      if (!row || row.usedAt) return null;
      if (new Date(row.expiresAt).getTime() <= new Date(at).getTime()) return null;
      row.usedAt = at;
      return { ...row, scopes: [...row.scopes] };
    },

    async insertAccess(row) {
      access.set(row.id, { ...row, scopes: [...row.scopes] });
    },

    async getAccess(id) {
      const row = access.get(id);
      return row ? { ...row, scopes: [...row.scopes] } : null;
    },

    async revokeAccessForGrant(grantId, at) {
      for (const token of access.values()) {
        if (token.grantId === grantId && !token.revokedAt) token.revokedAt = at;
      }
    },

    async touchAccess(id, at) {
      const row = access.get(id);
      if (row) row.lastUsedAt = at;
    },

    async insertRefresh(row) {
      refresh.set(row.id, { ...row, scopes: [...row.scopes] });
    },

    async getRefresh(id) {
      const row = refresh.get(id);
      return row ? { ...row, scopes: [...row.scopes] } : null;
    },

    async rotateRefresh(id, at, replacementId) {
      const row = refresh.get(id);
      if (!row || row.revokedAt) return null;
      if (new Date(row.expiresAt).getTime() <= new Date(at).getTime()) return null;
      row.revokedAt = at;
      row.replacedBy = replacementId;
      return { ...row, scopes: [...row.scopes] };
    },

    async revokeRefreshForGrant(grantId, at) {
      for (const token of refresh.values()) {
        if (token.grantId === grantId && !token.revokedAt) token.revokedAt = at;
      }
    },

    async hitRateLimit(bucket, windowSeconds, limit) {
      const nowMs = Date.now();
      const current = buckets.get(bucket);
      if (!current || nowMs - current.start >= windowSeconds * 1000) {
        buckets.set(bucket, { start: nowMs, count: 1 });
        return { allowed: 1 <= limit };
      }
      current.count += 1;
      return { allowed: current.count <= limit };
    },
  };
}
