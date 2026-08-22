import { describe, it, expect } from "vitest";
import {
  applyDraftToEntry,
  isEmptyDoc,
  resolveInitialEditorContent,
  shouldApplyDraft,
  shouldBlockEmptySave,
  shouldReplayPendingWrite,
  shouldSyncEditorFromProps,
} from "./editorContent";

describe("editorContent", () => {
  it("detects empty TipTap docs", () => {
    expect(isEmptyDoc(null)).toBe(true);
    expect(isEmptyDoc({ type: "doc", content: [] })).toBe(true);
    expect(isEmptyDoc({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
    expect(
      isEmptyDoc({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "pageRef", attrs: { pageId: "page-a" } }] },
        ],
      }),
    ).toBe(false);
    expect(
      isEmptyDoc({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  { type: "tableCell", content: [{ type: "paragraph" }] },
                  { type: "tableCell", content: [{ type: "paragraph" }] },
                ],
              },
            ],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isEmptyDoc({
        type: "doc",
        content: [
          {
            type: "outlineBlock",
            content: [{ type: "paragraph" }, { type: "paragraph" }],
          },
        ],
      }),
    ).toBe(true);
    expect(
      isEmptyDoc({
        type: "doc",
        content: [
          {
            type: "outlineBlock",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "hello" }] },
              { type: "paragraph", content: [{ type: "text", text: "world" }] },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it("loads nested-outline markdown when content_json is an empty nested paragraph", () => {
    const markdown = '<div data-type="paragraph">hello<p>world</p></div>';
    const resolved = resolveInitialEditorContent(markdown, {
      type: "doc",
      content: [{ type: "outlineBlock", content: [{ type: "paragraph" }] }],
    });
    expect(typeof resolved).toBe("string");
    expect(resolved).toContain("hello");
    expect(resolved).toContain("world");
  });

  it("does not treat nested outline markdown as an empty save", () => {
    expect(shouldBlockEmptySave("x".repeat(25), '<div data-type="paragraph">hello<p>world</p></div>')).toBe(false);
  });

  it("does not treat folded-heading markdown as an empty save", () => {
    const markdown = '<h2 data-collapsed="true">Alpha</h2>\n\nsecret body';
    expect(shouldBlockEmptySave("x".repeat(25), markdown)).toBe(false);
    expect(isEmptyDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2, collapsed: true }, content: [{ type: "text", text: "Alpha" }] },
        { type: "paragraph", content: [{ type: "text", text: "secret body" }] },
      ],
    })).toBe(false);
  });

  it("prefers markdown when content_json is an empty doc", () => {
    const resolved = resolveInitialEditorContent("hello world", { type: "doc", content: [] });
    expect(typeof resolved).toBe("string");
    expect(resolved).toContain("hello");
  });

  it("uses content_json when it has real nodes", () => {
    const json = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "from json" }] }],
    };
    expect(resolveInitialEditorContent("ignored markdown", json)).toEqual(json);
  });

  it("ignores empty local drafts over existing content", () => {
    expect(shouldApplyDraft("saved notes", "")).toBe(false);
    expect(shouldApplyDraft("", "")).toBe(true);
    expect(shouldApplyDraft("saved", "draft")).toBe(true);
  });

  it("applies JSON-only drafts, which is what the typing path writes", () => {
    const typed = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "unsaved edit" }] }],
    };
    expect(shouldApplyDraft("saved notes long enough to matter", "", typed)).toBe(true);
    expect(shouldApplyDraft("saved notes long enough to matter", "", { type: "doc", content: [] })).toBe(false);
    expect(shouldApplyDraft("saved notes long enough to matter", "", null)).toBe(false);
  });

  it("blocks empty autosave over substantial content", () => {
    expect(shouldBlockEmptySave("x".repeat(25), "")).toBe(true);
    expect(shouldBlockEmptySave("short", "")).toBe(false);
    expect(shouldBlockEmptySave("long content here", "still writing")).toBe(false);
  });

  it("blocks replaying empty pending writes over server content", () => {
    expect(shouldReplayPendingWrite("saved notes with enough text here", "")).toBe(false);
    expect(shouldReplayPendingWrite("", "")).toBe(true);
    expect(shouldReplayPendingWrite("saved", "offline edit")).toBe(true);
  });

  it("re-applies a fresher JSON-only draft over server content", () => {
    const server = {
      content: "old server text",
      content_json: {
        type: "doc" as const,
        content: [{ type: "paragraph", content: [{ type: "text", text: "old server text" }] }],
      },
    };
    const draft = {
      markdown: "",
      json: {
        type: "doc" as const,
        content: [{ type: "paragraph", content: [{ type: "text", text: "typed after share" }] }],
      },
    };
    expect(applyDraftToEntry(server, draft)).toEqual({
      content: "old server text",
      content_json: draft.json,
    });
  });

  it("syncs editor from props when markdown is unchanged but content_json differs", () => {
    const lastJson = { type: "doc" as const, content: [{ type: "paragraph" }] };
    const incomingJson = {
      type: "doc" as const,
      content: [{ type: "paragraph", content: [{ type: "text", text: "restored" }] }],
    };
    expect(shouldSyncEditorFromProps("same markdown", incomingJson, "same markdown", lastJson)).toBe(true);
    expect(shouldSyncEditorFromProps("same markdown", lastJson, "same markdown", lastJson)).toBe(false);
    expect(shouldSyncEditorFromProps("a", incomingJson, "b", lastJson)).toBe(true);
  });
});
