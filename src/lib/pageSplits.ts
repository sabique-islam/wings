import { tabKey, type PageTab } from "./pageTabs";

export const MAIN_PANE_ID = "main";
export const MAX_SPLIT_PANES = 4;

export type PagePane = {
  id: string;
  tabKeys: string[];
  activeKey: string | null;
};

export type PageSplitState = {
  panes: PagePane[];
  activePaneId: string;
  sizes: number[];
};

export function emptyPageSplitState(): PageSplitState {
  return {
    panes: [{ id: MAIN_PANE_ID, tabKeys: [], activeKey: null }],
    activePaneId: MAIN_PANE_ID,
    sizes: [100],
  };
}

function equalSizes(count: number): number[] {
  return Array.from({ length: count }, () => 100 / count);
}

function normalizeSizes(sizes: number[], count: number): number[] {
  if (sizes.length !== count || sizes.some((size) => !Number.isFinite(size) || size <= 0)) {
    return equalSizes(count);
  }
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total <= 0) return equalSizes(count);
  return sizes.map((size) => (size / total) * 100);
}

function uniqueKeys(keys: string[], validKeys: Set<string>, claimed: Set<string>): string[] {
  return keys.filter((key) => {
    if (!validKeys.has(key) || claimed.has(key)) return false;
    claimed.add(key);
    return true;
  });
}

export function normalizePageSplitState(
  state: PageSplitState,
  tabs: PageTab[],
  focusedKey: string | null,
): PageSplitState {
  const validKeys = new Set(tabs.map(tabKey));
  const claimed = new Set<string>();
  const sourcePanes = Array.isArray(state.panes) ? state.panes.slice(0, MAX_SPLIT_PANES) : [];
  let panes = sourcePanes
    .filter((pane) => pane && typeof pane.id === "string")
    .map((pane) => {
      const tabKeys = uniqueKeys(Array.isArray(pane.tabKeys) ? pane.tabKeys : [], validKeys, claimed);
      return {
        id: pane.id,
        tabKeys,
        activeKey: pane.activeKey && tabKeys.includes(pane.activeKey) ? pane.activeKey : tabKeys[0] ?? null,
      };
    })
    .filter((pane, index) => pane.tabKeys.length > 0 || index === 0);

  if (panes.length === 0) panes = emptyPageSplitState().panes;

  const activePaneIndex = Math.max(
    0,
    panes.findIndex((pane) => pane.id === state.activePaneId),
  );
  const unclaimed = tabs.map(tabKey).filter((key) => !claimed.has(key));
  if (unclaimed.length > 0) {
    const pane = panes[activePaneIndex] ?? panes[0]!;
    pane.tabKeys.push(...unclaimed);
    if (!pane.activeKey) pane.activeKey = unclaimed[0] ?? null;
  }

  let activePaneId = panes[activePaneIndex]?.id ?? panes[0]!.id;
  if (focusedKey) {
    const focusedPane = panes.find((pane) => pane.tabKeys.includes(focusedKey));
    if (focusedPane) {
      focusedPane.activeKey = focusedKey;
      activePaneId = focusedPane.id;
    }
  }

  return {
    panes,
    activePaneId,
    sizes: normalizeSizes(state.sizes, panes.length),
  };
}

export function focusPaneTab(
  state: PageSplitState,
  paneId: string,
  key: string,
): PageSplitState {
  const pane = state.panes.find((item) => item.id === paneId);
  if (!pane?.tabKeys.includes(key)) return state;
  return {
    ...state,
    activePaneId: paneId,
    panes: state.panes.map((item) => (item.id === paneId ? { ...item, activeKey: key } : item)),
  };
}

export function splitTabOnto(
  state: PageSplitState,
  draggedKey: string,
  targetKey: string,
  newPaneId: string,
): PageSplitState {
  if (draggedKey === targetKey || state.panes.length >= MAX_SPLIT_PANES) return state;
  const sourceIndex = state.panes.findIndex((pane) => pane.tabKeys.includes(draggedKey));
  const targetIndex = state.panes.findIndex((pane) => pane.tabKeys.includes(targetKey));
  if (sourceIndex < 0 || targetIndex < 0) return state;

  if (sourceIndex !== targetIndex) {
    return moveTabToPane(state, draggedKey, state.panes[targetIndex]!.id, targetKey);
  }

  const source = state.panes[sourceIndex]!;
  const remaining = source.tabKeys.filter((key) => key !== draggedKey);
  if (remaining.length === 0) return state;
  const sourceActive = source.activeKey === draggedKey ? targetKey : source.activeKey;
  const panes = [...state.panes];
  panes[sourceIndex] = { ...source, tabKeys: remaining, activeKey: sourceActive };
  panes.splice(sourceIndex + 1, 0, {
    id: newPaneId,
    tabKeys: [draggedKey],
    activeKey: draggedKey,
  });
  return {
    panes,
    activePaneId: newPaneId,
    sizes: equalSizes(panes.length),
  };
}

export function moveTabToPane(
  state: PageSplitState,
  draggedKey: string,
  targetPaneId: string,
  targetKey?: string,
): PageSplitState {
  const sourceIndex = state.panes.findIndex((pane) => pane.tabKeys.includes(draggedKey));
  const targetIndex = state.panes.findIndex((pane) => pane.id === targetPaneId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state;

  const panes = state.panes.map((pane) => ({ ...pane, tabKeys: [...pane.tabKeys] }));
  const source = panes[sourceIndex]!;
  const target = panes[targetIndex]!;
  source.tabKeys = source.tabKeys.filter((key) => key !== draggedKey);
  if (source.activeKey === draggedKey) source.activeKey = source.tabKeys[0] ?? null;

  const insertAt = targetKey ? target.tabKeys.indexOf(targetKey) + 1 : target.tabKeys.length;
  target.tabKeys.splice(Math.max(0, insertAt), 0, draggedKey);
  target.activeKey = draggedKey;

  const filtered = panes.filter((pane) => pane.tabKeys.length > 0);
  return {
    panes: filtered.length > 0 ? filtered : emptyPageSplitState().panes,
    activePaneId: targetPaneId,
    sizes: equalSizes(Math.max(filtered.length, 1)),
  };
}

export function moveTabWithinPane(
  state: PageSplitState,
  paneId: string,
  from: number,
  to: number,
): PageSplitState {
  const pane = state.panes.find((item) => item.id === paneId);
  if (!pane || from === to || from < 0 || to < 0 || from >= pane.tabKeys.length || to >= pane.tabKeys.length) {
    return state;
  }
  const tabKeys = [...pane.tabKeys];
  const [key] = tabKeys.splice(from, 1);
  if (!key) return state;
  tabKeys.splice(to, 0, key);
  return {
    ...state,
    panes: state.panes.map((item) => (item.id === paneId ? { ...item, tabKeys } : item)),
  };
}

export function removeTabsFromPanes(
  state: PageSplitState,
  removedKeys: Set<string>,
): PageSplitState {
  let panes = state.panes
    .map((pane) => {
      const tabKeys = pane.tabKeys.filter((key) => !removedKeys.has(key));
      return {
        ...pane,
        tabKeys,
        activeKey: pane.activeKey && tabKeys.includes(pane.activeKey) ? pane.activeKey : tabKeys[0] ?? null,
      };
    })
    .filter((pane) => pane.tabKeys.length > 0);

  if (panes.length === 0) panes = emptyPageSplitState().panes;
  const activePane = panes.find((pane) => pane.id === state.activePaneId) ?? panes[0]!;
  return {
    panes,
    activePaneId: activePane.id,
    sizes: normalizeSizes(state.sizes, panes.length),
  };
}

export function setPaneSizes(state: PageSplitState, sizes: number[]): PageSplitState {
  return { ...state, sizes: normalizeSizes(sizes, state.panes.length) };
}

export function readPageSplitState(userId: string): PageSplitState {
  if (!userId || typeof localStorage === "undefined") return emptyPageSplitState();
  try {
    const raw = localStorage.getItem(`nw:pageSplits:${userId}`);
    if (!raw) return emptyPageSplitState();
    const parsed = JSON.parse(raw) as PageSplitState;
    return {
      panes: Array.isArray(parsed.panes) ? parsed.panes : [],
      activePaneId: typeof parsed.activePaneId === "string" ? parsed.activePaneId : MAIN_PANE_ID,
      sizes: Array.isArray(parsed.sizes) ? parsed.sizes : [],
    };
  } catch {
    return emptyPageSplitState();
  }
}

export function writePageSplitState(userId: string, state: PageSplitState): void {
  if (!userId) return;
  try {
    localStorage.setItem(`nw:pageSplits:${userId}`, JSON.stringify(state));
  } catch {
    /* private browsing */
  }
}
