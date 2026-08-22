import { describe, expect, it } from "vitest";
import { outlineFromJSON } from "./editorOutline";

describe("outlineFromJSON", () => {
  it("lists headings in document order with text and level", () => {
    const entries = outlineFromJSON({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1, id: "h-one" }, content: [{ type: "text", text: "One" }] },
        { type: "paragraph", content: [{ type: "text", text: "body" }] },
        { type: "heading", attrs: { level: 2, id: "h-two", collapsed: true }, content: [{ type: "text", text: "Two" }] },
      ],
    });
    expect(entries).toEqual([
      { id: "h-one", level: 1, text: "One", collapsed: false },
      { id: "h-two", level: 2, text: "Two", collapsed: true },
    ]);
  });

  it("walks headings nested under outline wrappers", () => {
    const entries = outlineFromJSON({
      type: "doc",
      content: [
        {
          type: "outlineBlock",
          content: [
            { type: "heading", attrs: { level: 2, id: "nested" }, content: [{ type: "text", text: "Nested" }] },
            { type: "paragraph", content: [{ type: "text", text: "child" }] },
          ],
        },
      ],
    });
    expect(entries).toEqual([{ id: "nested", level: 2, text: "Nested", collapsed: false }]);
  });

  it("returns nothing for an empty doc", () => {
    expect(outlineFromJSON({ type: "doc", content: [] })).toEqual([]);
    expect(outlineFromJSON(null)).toEqual([]);
  });

  it("lists a heading that has no UniqueID yet", () => {
    const entries = outlineFromJSON({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Old" }] }],
    });
    expect(entries).toEqual([{ id: null, level: 3, text: "Old", collapsed: false }]);
  });
});
