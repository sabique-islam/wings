import type { Scope } from "./validate.js";

export interface PageRow {
  id: string;
  userId: string;
  title: string;
  parentId: string | null;
  content: string;
  contentStorage: "cloud" | "local";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Editor JSON, loaded by `getPage` only so a restore point can keep it. Never returned by the API. */
  contentJson?: unknown;
}

export interface VersionInput {
  entryId: string;
  authorId: string;
  content: string;
  /** Null makes a restore re-derive JSON from the markdown through the editor schema. */
  contentJson: unknown;
}

export interface PatRow {
  id: string;
  userId: string;
  name: string;
  tokenPrefix: string;
  secretHash: string;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface ClientRow {
  id: string;
  name: string;
  redirectUris: string[];
  createdAt: string;
}

export interface GrantRow {
  id: string;
  userId: string;
  clientId: string;
  scopes: Scope[];
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface CodeRow {
  id: string;
  userId: string;
  clientId: string;
  grantId: string;
  redirectUri: string;
  scopes: Scope[];
  codeHash: string;
  codeChallenge: string;
  resource: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface AccessRow {
  id: string;
  grantId: string;
  userId: string;
  secretHash: string;
  tokenPrefix: string;
  scopes: Scope[];
  resource: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface RefreshRow {
  id: string;
  grantId: string;
  userId: string;
  secretHash: string;
  tokenPrefix: string;
  scopes: Scope[];
  resource: string;
  expiresAt: string;
  revokedAt: string | null;
  replacedBy: string | null;
  lastUsedAt: string | null;
}

export interface PagePatch {
  title?: string;
  content?: string;
  contentJson?: unknown;
  parentId?: string | null;
}

export interface ApiStore {
  listPages(userId: string, limit: number, offset: number): Promise<PageRow[]>;
  getPage(userId: string, id: string): Promise<PageRow | null>;
  searchPages(userId: string, query: string, limit: number): Promise<PageRow[]>;
  createPage(input: {
    userId: string;
    title: string;
    content: string;
    contentJson: unknown;
    parentId: string | null;
  }): Promise<PageRow>;
  /**
   * Body mode only touches cloud pages without collab state. Returns null when
   * the row is missing, local, or has `content_yjs`.
   */
  updatePage(userId: string, id: string, patch: PagePatch, mode: "meta" | "body"): Promise<PageRow | null>;
  /** True when the page has `content_yjs`, so the collab server would replay its own copy over ours. */
  hasCollabState(userId: string, id: string): Promise<boolean>;
  /**
   * Adds an `entry_versions` row unless the newest one has the same content.
   * Returns whether a row was written. Throws StoreError when the write fails.
   */
  recordVersion(input: VersionInput): Promise<boolean>;

  listPats(userId: string): Promise<PatRow[]>;
  countActivePats(userId: string): Promise<number>;
  insertPat(row: PatRow): Promise<void>;
  getPat(id: string): Promise<PatRow | null>;
  revokePat(userId: string, id: string, at: string): Promise<boolean>;
  touchPat(id: string, at: string): Promise<void>;

  insertClient(row: ClientRow): Promise<void>;
  getClient(id: string): Promise<ClientRow | null>;

  insertGrant(row: GrantRow): Promise<void>;
  listGrants(userId: string): Promise<GrantRow[]>;
  findActiveGrant(userId: string, clientId: string): Promise<GrantRow | null>;
  getGrant(id: string): Promise<GrantRow | null>;
  updateGrantScopes(id: string, scopes: Scope[], at: string): Promise<void>;
  revokeGrant(userId: string, id: string, at: string): Promise<boolean>;
  touchGrant(id: string, at: string): Promise<void>;

  insertCode(row: CodeRow): Promise<void>;
  /** Marks the code used and returns it. A second call returns null. */
  consumeCode(id: string, at: string): Promise<CodeRow | null>;

  insertAccess(row: AccessRow): Promise<void>;
  getAccess(id: string): Promise<AccessRow | null>;
  revokeAccessForGrant(grantId: string, at: string): Promise<void>;
  touchAccess(id: string, at: string): Promise<void>;

  insertRefresh(row: RefreshRow): Promise<void>;
  getRefresh(id: string): Promise<RefreshRow | null>;
  /** Succeeds once, and only while the row is unrevoked and unexpired. */
  rotateRefresh(id: string, at: string, replacementId: string): Promise<RefreshRow | null>;
  revokeRefreshForGrant(grantId: string, at: string): Promise<void>;

  hitRateLimit(bucket: string, windowSeconds: number, limit: number): Promise<{ allowed: boolean }>;
}

export class StoreError extends Error {
  constructor() {
    super("store");
    this.name = "StoreError";
  }
}

export interface Principal {
  userId: string;
  scopes: Scope[];
  tokenId: string;
  kind: "pat" | "oauth";
}

export interface ServiceResult {
  status: number;
  body: unknown;
  authError?: "invalid_token" | "insufficient_scope";
}

export interface ApiLimits {
  ipPerMinute: number;
  tokenPerMinute: number;
  registerPerHour: number;
  sessionPerHour: number;
}

export interface ApiDeps {
  store: ApiStore;
  pepper: string;
  verifySession: (accessToken: string) => Promise<{ userId: string } | null>;
  now: () => Date;
  log: (event: string, fields?: Record<string, unknown>) => void;
  limits: ApiLimits;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  codeTtlSeconds: number;
}

export const DEFAULT_LIMITS: ApiLimits = {
  ipPerMinute: 120,
  tokenPerMinute: 60,
  registerPerHour: 10,
  sessionPerHour: 30,
};

export const LOCAL_BODY_MESSAGE =
  "This page's body is in the local vault on the owner's device. The server only has the title, so the API cannot return or change the body.";

export const COLLAB_BODY_MESSAGE =
  "This page has live collaboration history. The API cannot change its body without the collaboration server overwriting it. Edit it in Wings instead.";
