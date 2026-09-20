import { afterEach, describe, expect, it } from "vitest";
import {
  activateTab,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  cycleTab,
  emptyPageTabs,
  isPageTabsEnabled,
  moveTab,
  openTab,
  popClosedTab,
  pruneMissingTabs,
  readPageTabs,
  rememberClosedTab,
  setPageTabsEnabled,
  tabFromRoute,
  tabKey,
  writePageTabs,
} from "./pageTabs";

afterEach(() => {
  localStorage.removeItem("nw:pageTabsEnabled");
  localStorage.removeItem("nw:pageTabs:user-1");
});

const page = (id: string) => ({ kind: "page" as const, id });
const collection = (id: string) => ({ kind: "collection" as const, id });
const trash = { kind: "trash" as const, id: "trash" };

describe("page tabs", () => {
  it("maps the current route onto a tab", () => {
    expect(tabFromRoute({ pageId: "a", collectionId: null, trash: false })).toEqual(page("a"));
    expect(tabFromRoute({ pageId: null, collectionId: "c1", trash: false })).toEqual(collection("c1"));
    expect(tabFromRoute({ pageId: "a", collectionId: null, trash: true })).toEqual(trash);
    expect(tabFromRoute({ pageId: null, collectionId: null, trash: false })).toBeNull();
  });

  it("opens a new tab to the right of the active tab", () => {
    let state = openTab(emptyPageTabs(), page("a"));
    state = openTab(state, page("b"));
    state = activateTab(state, tabKey(page("a")));
    state = openTab(state, page("c"));
    expect(state.tabs.map((t) => t.id)).toEqual(["a", "c", "b"]);
    expect(state.activeKey).toBe("page:c");
  });

  it("activates an already-open tab instead of duplicating it", () => {
    let state = openTab(emptyPageTabs(), page("a"));
    state = openTab(state, page("b"));
    state = openTab(state, page("a"));
    expect(state.tabs).toHaveLength(2);
    expect(state.activeKey).toBe("page:a");
  });

  it("closes the active tab and selects the one on its right", () => {
    let state = openTab(emptyPageTabs(), page("a"));
    state = openTab(state, page("b"));
    state = openTab(state, page("c"));
    state = activateTab(state, "page:b");
    state = closeTab(state, "page:b");
    expect(state.tabs.map((t) => t.id)).toEqual(["a", "c"]);
    expect(state.activeKey).toBe("page:c");
  });

  it("selects the left tab when closing the last tab", () => {
    let state = openTab(emptyPageTabs(), page("a"));
    state = openTab(state, page("b"));
    state = closeTab(state, "page:b");
    expect(state.activeKey).toBe("page:a");
    state = closeTab(state, "page:a");
    expect(state).toEqual(emptyPageTabs());
  });

  it("closes other tabs and tabs to the right", () => {
    let state = openTab(emptyPageTabs(), page("a"));
    state = openTab(state, page("b"));
    state = openTab(state, page("c"));
    expect(closeOtherTabs(state, "page:b").tabs.map((t) => t.id)).toEqual(["b"]);
    expect(closeTabsToRight(state, "page:a").tabs.map((t) => t.id)).toEqual(["a"]);
  });

  it("reorders tabs by index", () => {
    let state = openTab(emptyPageTabs(), page("a"));
    state = openTab(state, page("b"));
    state = openTab(state, page("c"));
    state = moveTab(state, 0, 2);
    expect(state.tabs.map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("cycles forward and backward", () => {
    let state = openTab(emptyPageTabs(), page("a"));
    state = openTab(state, page("b"));
    state = openTab(state, page("c"));
    state = activateTab(state, "page:a");
    state = cycleTab(state, 1);
    expect(state.activeKey).toBe("page:b");
    state = cycleTab(state, -1);
    expect(state.activeKey).toBe("page:a");
    state = cycleTab(state, -1);
    expect(state.activeKey).toBe("page:c");
  });

  it("drops tabs for deleted pages and collections", () => {
    let state = openTab(emptyPageTabs(), page("a"));
    state = openTab(state, collection("c1"));
    state = openTab(state, page("b"));
    state = pruneMissingTabs(state, { pages: new Set(["b"]), collections: new Set() });
    expect(state.tabs.map((t) => t.id)).toEqual(["b"]);
    expect(state.activeKey).toBe("page:b");
  });

  it("restores the most recently closed tab", () => {
    let stack = rememberClosedTab([], page("a"));
    stack = rememberClosedTab(stack, page("b"));
    const first = popClosedTab(stack);
    expect(first.tab).toEqual(page("b"));
    const second = popClosedTab(first.stack);
    expect(second.tab).toEqual(page("a"));
  });

  it("defaults to enabled and can be turned off", () => {
    expect(isPageTabsEnabled()).toBe(true);
    setPageTabsEnabled(false);
    expect(isPageTabsEnabled()).toBe(false);
    setPageTabsEnabled(true);
    expect(isPageTabsEnabled()).toBe(true);
  });

  it("caps the tab strip and persists per user", () => {
    let state = emptyPageTabs();
    for (let i = 0; i < 45; i += 1) state = openTab(state, page(`p${i}`));
    expect(state.tabs).toHaveLength(40);
    expect(state.tabs[0]?.id).toBe("p5");
    writePageTabs("user-1", state);
    expect(readPageTabs("user-1").tabs).toHaveLength(40);
    expect(readPageTabs("user-1").activeKey).toBe("page:p44");
  });
});
