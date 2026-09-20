const STORAGE_KEY = "nw:sidebarSectionCollapsed";

export const SIDEBAR_SECTION = {
  pinned: "pinned",
  collections: "collections",
  pages: "pages",
  shared: "shared",
} as const;

export function monthSectionId(monthKey: string): string {
  return `month:${monthKey}`;
}

export function readCollapsedSidebarSections(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export function writeCollapsedSidebarSections(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* private browsing */
  }
}

export function toggleCollapsedSection(ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Search should reveal matches even if the user had the section folded. */
export function isSidebarSectionCollapsed(ids: Set<string>, id: string, searching: boolean): boolean {
  if (searching) return false;
  return ids.has(id);
}
