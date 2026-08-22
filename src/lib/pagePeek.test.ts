import { describe, expect, it, vi, afterEach } from "vitest";
import {
  nextPeekPageId,
  pageLinkClickAction,
  pageLinkShiftClick,
  peekEditorEntryId,
  requestClosePagePeek,
  requestPagePeek,
  resolvePeekEntry,
  shouldEmitEditorChange,
  shouldHostEditorGlobals,
} from "./pagePeek";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pageLinkShiftClick", () => {
  it("peeks on shift-click and navigates otherwise", () => {
    expect(pageLinkShiftClick(true)).toBe("peek");
    expect(pageLinkShiftClick(false)).toBe("navigate");
  });

  it("always peeks from inside a peek editor", () => {
    expect(pageLinkClickAction({ peekEditor: true, shiftKey: false })).toBe("peek");
    expect(pageLinkClickAction({ peekEditor: false, shiftKey: true })).toBe("peek");
    expect(pageLinkClickAction({ peekEditor: false, shiftKey: false })).toBe("navigate");
  });
});

describe("nextPeekPageId", () => {
  it("replaces the open peek instead of stacking", () => {
    expect(nextPeekPageId("page-a", "page-b")).toBe("page-b");
    expect(nextPeekPageId(null, "page-a")).toBe("page-a");
    expect(nextPeekPageId("page-a", "  ")).toBeNull();
  });
});

describe("resolvePeekEntry", () => {
  it("reads title and content from the in-memory list", () => {
    expect(
      resolvePeekEntry("p1", [{ id: "p1", title: "Reading", content: "books", content_json: null }]),
    ).toEqual({
      id: "p1",
      title: "Reading",
      content: "books",
      content_json: null,
    });
  });

  it("returns null when the page is not loaded", () => {
    expect(resolvePeekEntry("missing", [{ id: "p1", title: "Reading", content: "books" }])).toBeNull();
  });
});

describe("peek editor isolation", () => {
  it("must not host window globals or emit saves", () => {
    expect(shouldHostEditorGlobals(true)).toBe(false);
    expect(shouldEmitEditorChange(true)).toBe(false);
    expect(shouldHostEditorGlobals(false)).toBe(true);
    expect(shouldEmitEditorChange(false)).toBe(true);
    expect(peekEditorEntryId("p1")).toBe("peek:p1");
  });
});

describe("requestPagePeek", () => {
  it("dispatches a replace event", () => {
    const seen: string[] = [];
    const onPeek = (event: Event) => seen.push(String((event as CustomEvent).detail));
    window.addEventListener("nw:peek", onPeek);
    requestPagePeek("page-a");
    requestPagePeek("page-b");
    requestClosePagePeek();
    window.removeEventListener("nw:peek", onPeek);
    expect(seen).toEqual(["page-a", "page-b"]);
  });
});
