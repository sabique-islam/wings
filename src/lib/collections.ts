import { getEntryTitle, type Entry } from "./journal";

export interface FilterParams {
  type: string;
  key: string;
  method: string;
  value?: string;
}

export interface CollectionInfo {
  id: string;
  name: string;
  rules: { filters: FilterParams[] };
  allowList: string[];
}

const MS_PER_DAY = 86_400_000;

export function parseFilters(raw: unknown): FilterParams[] {
  if (!Array.isArray(raw)) return [];
  const out: FilterParams[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key : "";
    if (!key) continue;
    out.push({
      type: typeof row.type === "string" ? row.type : "system",
      key,
      method: typeof row.method === "string" ? row.method : "",
      value: row.value == null ? undefined : String(row.value),
    });
  }
  return out;
}

export function parseCollectionRules(raw: unknown): { filters: FilterParams[] } {
  if (!raw || typeof raw !== "object") return { filters: [] };
  return { filters: parseFilters((raw as { filters?: unknown }).filters) };
}

export function matchesFilter(entry: Entry, filter: FilterParams): boolean {
  if (entry.deleted_at) return false;
  if (filter.type !== "system") return false;

  switch (filter.key) {
    case "title": {
      const title = getEntryTitle(entry).toLowerCase();
      const value = (filter.value ?? "").toLowerCase();
      if (filter.method === "contains") return title.includes(value);
      if (filter.method === "is") return title === value;
      return false;
    }
    case "favorite": {
      if (filter.method !== "is") return false;
      return entry.pinned === (filter.value === "true");
    }
    case "updatedAt": {
      if (filter.method !== "within") return false;
      const days = Number(filter.value);
      if (!Number.isFinite(days) || days < 0) return false;
      const ts = Date.parse(entry.created_at);
      if (Number.isNaN(ts)) return false;
      return ts >= Date.now() - days * MS_PER_DAY;
    }
    case "parent": {
      if (filter.method === "is-root") return entry.parent_id == null;
      if (filter.method === "is") return entry.parent_id === filter.value;
      return false;
    }
    default:
      return false;
  }
}

export function matchCollection(
  entries: Entry[],
  info: Pick<CollectionInfo, "rules" | "allowList">,
): Entry[] {
  const live = entries.filter((entry) => !entry.deleted_at);
  const filters = info.rules.filters;
  const primary = new Set<string>();

  if (filters.length > 0) {
    const groups = filters.map(
      (filter) => new Set(live.filter((entry) => matchesFilter(entry, filter)).map((entry) => entry.id)),
    );
    const [first, ...rest] = groups;
    for (const id of first) {
      if (rest.every((group) => group.has(id))) primary.add(id);
    }
  }

  const ids = new Set(primary);
  for (const id of info.allowList) ids.add(id);
  return live.filter((entry) => ids.has(entry.id));
}
