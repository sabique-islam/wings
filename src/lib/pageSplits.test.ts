import { afterEach, describe, expect, it } from "vitest";
import type { PageTab } from "./pageTabs";
import {
  emptyPageSplitState,
  focusPaneTab,
  moveTabToPane,
  moveTabWithinPane,
  normalizePageSplitState,
  readPageSplitState,
  removeTabsFromPanes,
  setPaneSizes,
  splitTabOnto,
  writePageSplitState,
} from "./pageSplits";

const page = (id: string): PageTab => ({ kind: "page", id });

afterEach(() => {
  localStorage.removeItem("nw:pageSplits:user-1");
});

describe("page splits", () => {
  it("assigns open tabs to the main pane", () => {
    const state = normalizePageSplitState(emptyPageSplitState(), [page("a"), page("b")], "page:b");
    expect(state.panes[0]?.tabKeys).toEqual(["page:a", "page:b"]);
    expect(state.panes[0]?.activeKey).toBe("page:b");
  });

  it("splits a dragged tab beside its target", () => {
    const initial = normalizePageSplitState(emptyPageSplitState(), [page("a"), page("b")], "page:a");
    const state = splitTabOnto(initial, "page:b", "page:a", "pane-2");
    expect(state.panes).toEqual([
      { id: "main", tabKeys: ["page:a"], activeKey: "page:a" },
      { id: "pane-2", tabKeys: ["page:b"], activeKey: "page:b" },
    ]);
    expect(state.activePaneId).toBe("pane-2");
  });

  it("moves tabs between existing panes and collapses an empty source", () => {
    const initial = splitTabOnto(
      normalizePageSplitState(emptyPageSplitState(), [page("a"), page("b")], "page:a"),
      "page:b",
      "page:a",
      "pane-2",
    );
    const state = moveTabToPane(initial, "page:b", "main", "page:a");
    expect(state.panes).toEqual([
      { id: "main", tabKeys: ["page:a", "page:b"], activeKey: "page:b" },
    ]);
    expect(state.activePaneId).toBe("main");
  });

  it("focuses and reorders tabs inside one pane", () => {
    const initial = normalizePageSplitState(
      emptyPageSplitState(),
      [page("a"), page("b"), page("c")],
      "page:a",
    );
    const reordered = moveTabWithinPane(initial, "main", 2, 0);
    expect(reordered.panes[0]?.tabKeys).toEqual(["page:c", "page:a", "page:b"]);
    expect(focusPaneTab(reordered, "main", "page:b").panes[0]?.activeKey).toBe("page:b");
  });

  it("removes closed tabs and collapses empty panes", () => {
    const initial = splitTabOnto(
      normalizePageSplitState(emptyPageSplitState(), [page("a"), page("b")], "page:a"),
      "page:b",
      "page:a",
      "pane-2",
    );
    const state = removeTabsFromPanes(initial, new Set(["page:b"]));
    expect(state.panes).toHaveLength(1);
    expect(state.panes[0]?.id).toBe("main");
  });

  it("normalizes and persists pane sizes", () => {
    const initial = splitTabOnto(
      normalizePageSplitState(emptyPageSplitState(), [page("a"), page("b")], "page:a"),
      "page:b",
      "page:a",
      "pane-2",
    );
    const resized = setPaneSizes(initial, [35, 65]);
    writePageSplitState("user-1", resized);
    expect(readPageSplitState("user-1").sizes).toEqual([35, 65]);
  });
});
