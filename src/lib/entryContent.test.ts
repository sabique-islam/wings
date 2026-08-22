import { describe, it, expect } from "vitest";
import { appendMarkdown, payloadFromMarkdown } from "./entryContent";
import { resolveInitialEditorContent, shouldBlockEmptySave } from "./editorContent";

describe("appendMarkdown", () => {
  it("separates the addition with one blank line", () => {
    expect(appendMarkdown("first", "second")).toBe("first\n\nsecond");
  });

  it("does not leave leading blank lines on an empty page", () => {
    expect(appendMarkdown("", "second")).toBe("second");
    expect(appendMarkdown("   \n\n", "second")).toBe("second");
  });

  it("leaves the page alone when there is nothing to add", () => {
    expect(appendMarkdown("first", "   ")).toBe("first");
  });

  it("never shortens the page it appends to", () => {
    const existing = "a page with a decent amount of text in it";
    const next = appendMarkdown(existing, "moved block");

    expect(next.startsWith(existing)).toBe(true);
    expect(shouldBlockEmptySave(existing, next)).toBe(false);
  });
});

describe("payloadFromMarkdown", () => {
  it("produces JSON that carries the same text as the markdown", () => {
    const { markdown, json } = payloadFromMarkdown("# Heading\n\nSome body text.");

    expect(markdown).toContain("# Heading");
    expect(JSON.stringify(json)).toContain("Some body text.");
  });

  it("parses inline page links as pageRef nodes keyed by id", () => {
    const { json } = payloadFromMarkdown("see [Notes](#page:abc-123)");
    expect(JSON.stringify(json)).toContain('"type":"pageRef"');
    expect(JSON.stringify(json)).toContain("abc-123");
    expect(JSON.stringify(json)).not.toContain("Notes");
  });

  it("round-trips back to the same document through the load resolver", () => {
    const payload = payloadFromMarkdown("- one\n- two");

    // Non-empty JSON must win on load, and it must not be an empty doc.
    expect(resolveInitialEditorContent(payload.markdown, payload.json)).toBe(payload.json);
  });

  it("returns an empty doc for blank markdown rather than a bogus paragraph", () => {
    expect(payloadFromMarkdown("   ")).toEqual({
      markdown: "",
      json: { type: "doc", content: [] },
    });
  });
});
