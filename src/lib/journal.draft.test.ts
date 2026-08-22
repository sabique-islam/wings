import { describe, expect, it } from "vitest";
import type { Entry } from "./journal";
import { findReusableBlankDraft, isBlankDraftPage, normalizeEntryTitle } from "./journal";

function draft(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "e1",
    content: "",
    content_json: null,
    created_at: "2026-01-01T00:00:00Z",
    user_id: "u1",
    pinned: false,
    parent_id: null,
    title: "",
    share_token: null,
    content_storage: "cloud",
    layout: {},
    sort_order: null,
    deleted_at: null,
    ...overrides,
  };
}

describe("normalizeEntryTitle", () => {
  it("trims and caps at 100 characters", () => {
    expect(normalizeEntryTitle("  Notes  ")).toBe("Notes");
    expect(normalizeEntryTitle("n".repeat(120))).toHaveLength(100);
  });

  it("treats blank names as empty so they stay Untitled", () => {
    expect(normalizeEntryTitle("   ")).toBe("");
    expect(normalizeEntryTitle(undefined)).toBe("");
  });
});

describe("isBlankDraftPage", () => {
  it("matches an empty untitled page", () => {
    expect(isBlankDraftPage(draft())).toBe(true);
  });

  it("rejects pages with a saved title", () => {
    expect(isBlankDraftPage(draft({ title: "Notes" }))).toBe(false);
  });

  it("rejects pages with saved body content", () => {
    expect(isBlankDraftPage(draft({ content: "hello" }))).toBe(false);
  });

  it("rejects pages with non-empty TipTap JSON", () => {
    expect(
      isBlankDraftPage(
        draft({
          content_json: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
          },
        }),
      ),
    ).toBe(false);
  });

  it("rejects deleted pages", () => {
    expect(isBlankDraftPage(draft({ deleted_at: "2026-01-02T00:00:00Z" }))).toBe(false);
  });
});

describe("findReusableBlankDraft", () => {
  it("returns the newest blank draft for the same parent", () => {
    const entries = [
      draft({ id: "old", created_at: "2026-01-01T00:00:00Z" }),
      draft({ id: "new", created_at: "2026-01-02T00:00:00Z" }),
      draft({ id: "filled", created_at: "2026-01-03T00:00:00Z", content: "done" }),
    ];

    expect(findReusableBlankDraft(entries, "u1", null)?.id).toBe("new");
  });

  it("scopes sub-page reuse to the same parent", () => {
    const entries = [
      draft({ id: "root-blank" }),
      draft({ id: "child-blank", parent_id: "parent" }),
      draft({ id: "other-child", parent_id: "other" }),
    ];

    expect(findReusableBlankDraft(entries, "u1", "parent")?.id).toBe("child-blank");
    expect(findReusableBlankDraft(entries, "u1", "other")?.id).toBe("other-child");
    expect(findReusableBlankDraft(entries, "u1", null)?.id).toBe("root-blank");
  });
});
