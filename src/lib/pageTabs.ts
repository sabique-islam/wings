const ENABLED_KEY = "nw:pageTabsEnabled";
const SESSION_PREFIX = "nw:pageTabs:";
export const PAGE_TABS_ENABLED_EVENT = "nw:page-tabs-enabled";

export const MAX_OPEN_TABS = 40;
export const MAX_CLOSED_TABS = 20;

export type PageTabKind = "page" | "collection" | "trash";

export type PageTab = {
  kind: PageTabKind;
  id: string;
};

export type PageTabsState = {
  tabs: PageTab[];
  activeKey: string | null;
};

export function tabKey(tab: PageTab): string {
  return tab.kind === "trash" ? "trash" : `${tab.kind}:${tab.id}`;
}

export function emptyPageTabs(): PageTabsState {
  return { tabs: [], activeKey: null };
}

export function tabFromRoute(opts: {
  pageId: string | null | undefined;
  collectionId: string | null | undefined;
  trash: boolean;
}): PageTab | null {
  if (opts.trash) return { kind: "trash", id: "trash" };
  if (opts.collectionId) return { kind: "collection", id: opts.collectionId };
  if (opts.pageId) return { kind: "page", id: opts.pageId };
  return null;
}

export function isPageTabsEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (raw === "0") return false;
    return true;
  } catch {
    return true;
  }
}

export function setPageTabsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* private browsing */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PAGE_TABS_ENABLED_EVENT, { detail: enabled }));
  }
}

function isPageTab(value: unknown): value is PageTab {
  if (!value || typeof value !== "object") return false;
  const tab = value as PageTab;
  if (tab.kind === "trash") return true;
  return (tab.kind === "page" || tab.kind === "collection") && typeof tab.id === "string" && tab.id.length > 0;
}

export function readPageTabs(userId: string): PageTabsState {
  if (!userId || typeof localStorage === "undefined") return emptyPageTabs();
  try {
    const raw = localStorage.getItem(`${SESSION_PREFIX}${userId}`);
    if (!raw) return emptyPageTabs();
    const parsed = JSON.parse(raw) as { tabs?: unknown; activeKey?: unknown };
    const tabs = Array.isArray(parsed.tabs) ? parsed.tabs.filter(isPageTab) : [];
    const activeKey = typeof parsed.activeKey === "string" ? parsed.activeKey : null;
    const keys = new Set(tabs.map(tabKey));
    return {
      tabs,
      activeKey: activeKey && keys.has(activeKey) ? activeKey : null,
    };
  } catch {
    return emptyPageTabs();
  }
}

export function writePageTabs(userId: string, state: PageTabsState): void {
  if (!userId) return;
  try {
    localStorage.setItem(
      `${SESSION_PREFIX}${userId}`,
      JSON.stringify({ tabs: state.tabs, activeKey: state.activeKey }),
    );
  } catch {
    /* private browsing */
  }
}

export function findTab(state: PageTabsState, key: string | null): PageTab | null {
  if (!key) return null;
  return state.tabs.find((tab) => tabKey(tab) === key) ?? null;
}

/** Open `tab`, inserting it to the right of the current tab like a browser. */
export function openTab(state: PageTabsState, tab: PageTab, background = false): PageTabsState {
  const key = tabKey(tab);
  const existing = state.tabs.findIndex((item) => tabKey(item) === key);
  if (existing >= 0) {
    return background ? state : { ...state, activeKey: key };
  }
  const activeIdx = state.tabs.findIndex((item) => tabKey(item) === state.activeKey);
  const insertAt = activeIdx >= 0 ? activeIdx + 1 : state.tabs.length;
  let tabs = [...state.tabs.slice(0, insertAt), tab, ...state.tabs.slice(insertAt)];
  if (tabs.length > MAX_OPEN_TABS) {
    const drop = tabs[0] && tabKey(tabs[0]) !== key ? 0 : 1;
    tabs = tabs.filter((_, i) => i !== drop);
  }
  return { tabs, activeKey: background ? state.activeKey : key };
}

/** Chrome: closing the active tab selects the one on its right, else the left. */
export function closeTab(state: PageTabsState, key: string): PageTabsState {
  const index = state.tabs.findIndex((tab) => tabKey(tab) === key);
  if (index < 0) return state;
  const tabs = state.tabs.filter((_, i) => i !== index);
  if (state.activeKey !== key) return { tabs, activeKey: state.activeKey };
  const next = tabs[index] ?? tabs[index - 1] ?? null;
  return { tabs, activeKey: next ? tabKey(next) : null };
}

export function closeOtherTabs(state: PageTabsState, key: string): PageTabsState {
  const keep = state.tabs.find((tab) => tabKey(tab) === key);
  if (!keep) return state;
  return { tabs: [keep], activeKey: key };
}

export function closeTabsToRight(state: PageTabsState, key: string): PageTabsState {
  const index = state.tabs.findIndex((tab) => tabKey(tab) === key);
  if (index < 0) return state;
  const tabs = state.tabs.slice(0, index + 1);
  const activeStillOpen = tabs.some((tab) => tabKey(tab) === state.activeKey);
  return { tabs, activeKey: activeStillOpen ? state.activeKey : key };
}

export function activateTab(state: PageTabsState, key: string): PageTabsState {
  if (!state.tabs.some((tab) => tabKey(tab) === key)) return state;
  if (state.activeKey === key) return state;
  return { ...state, activeKey: key };
}

export function moveTab(state: PageTabsState, from: number, to: number): PageTabsState {
  if (from === to) return state;
  if (from < 0 || to < 0 || from >= state.tabs.length || to >= state.tabs.length) return state;
  const tabs = [...state.tabs];
  const [item] = tabs.splice(from, 1);
  if (!item) return state;
  tabs.splice(to, 0, item);
  return { ...state, tabs };
}

export function cycleTab(state: PageTabsState, direction: 1 | -1): PageTabsState {
  if (state.tabs.length === 0) return state;
  const current = state.tabs.findIndex((tab) => tabKey(tab) === state.activeKey);
  const start = current >= 0 ? current : direction === 1 ? -1 : 0;
  const next = (start + direction + state.tabs.length) % state.tabs.length;
  const tab = state.tabs[next];
  if (!tab) return state;
  return { ...state, activeKey: tabKey(tab) };
}

export function pruneMissingTabs(
  state: PageTabsState,
  valid: { pages: Set<string>; collections: Set<string> },
): PageTabsState {
  const tabs = state.tabs.filter((tab) => {
    if (tab.kind === "trash") return true;
    if (tab.kind === "page") return valid.pages.has(tab.id);
    return valid.collections.has(tab.id);
  });
  if (tabs.length === state.tabs.length) {
    if (state.activeKey && !tabs.some((tab) => tabKey(tab) === state.activeKey)) {
      return { tabs, activeKey: null };
    }
    return state;
  }
  let activeKey = state.activeKey;
  if (activeKey && !tabs.some((tab) => tabKey(tab) === activeKey)) {
    const oldIndex = state.tabs.findIndex((tab) => tabKey(tab) === state.activeKey);
    const next = tabs[Math.min(Math.max(oldIndex, 0), tabs.length - 1)] ?? null;
    activeKey = next ? tabKey(next) : null;
  }
  return { tabs, activeKey };
}

export function rememberClosedTab(stack: PageTab[], tab: PageTab): PageTab[] {
  const key = tabKey(tab);
  return [tab, ...stack.filter((item) => tabKey(item) !== key)].slice(0, MAX_CLOSED_TABS);
}

export function popClosedTab(stack: PageTab[]): { tab: PageTab | null; stack: PageTab[] } {
  if (stack.length === 0) return { tab: null, stack };
  return { tab: stack[0]!, stack: stack.slice(1) };
}
