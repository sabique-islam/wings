import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import {
  markdownForCopy,
  plaintextForCopy,
  resolveCopyRange,
  sliceToMarkdown,
} from "./copyMarkdown";

function makeEditor(content = "<p>hello</p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

function placeCursorInParagraph(editor: Editor, text: string) {
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === "paragraph" && node.textContent === text) {
      pos = nodePos + 1;
      return false;
    }
  });
  if (pos == null) throw new Error(`paragraph "${text}" not found`);
  editor.commands.setTextSelection(pos);
}

describe("resolveCopyRange", () => {
  it("uses the highlighted selection", () => {
    const editor = makeEditor("<p>hello world</p>");
    editor.commands.setTextSelection({ from: 7, to: 12 });
    expect(resolveCopyRange(editor, "auto")).toMatchObject({ kind: "selection", from: 7, to: 12 });
    editor.destroy();
  });

  it("falls back to the current block when the caret is collapsed", () => {
    const editor = makeEditor("<p>hello</p><p>world</p>");
    placeCursorInParagraph(editor, "world");
    const range = resolveCopyRange(editor, "auto");
    expect(range.kind).toBe("block");
    expect(sliceToMarkdown(editor, range.from, range.to).trim()).toBe("world");
    expect(sliceToMarkdown(editor, range.from, range.to)).not.toContain("hello");
    editor.destroy();
  });

  it("copies the whole page when asked", () => {
    const editor = makeEditor("<p>hello</p><p>world</p>");
    placeCursorInParagraph(editor, "world");
    const range = resolveCopyRange(editor, "page");
    expect(range.kind).toBe("page");
    const md = markdownForCopy(editor, "page");
    expect(md).toContain("hello");
    expect(md).toContain("world");
    editor.destroy();
  });
});

describe("sliceToMarkdown", () => {
  it("uses the same serializer as save for a heading", () => {
    const editor = makeEditor("<h1>Title</h1><p>body</p>");
    const md = markdownForCopy(editor, "page");
    expect(md).toMatch(/^#\s+Title/m);
    expect(md).toContain("body");
    editor.destroy();
  });

  it("keeps bold marks in the copied markdown", () => {
    const editor = makeEditor("<p><strong>hi</strong> there</p>");
    const md = markdownForCopy(editor, "page");
    expect(md).toMatch(/\*\*hi\*\*/);
    expect(plaintextForCopy(editor, "page")).toBe("hi there");
    editor.destroy();
  });

  it("does not change the document", () => {
    const editor = makeEditor("<p>keep me</p>");
    const before = editor.getJSON();
    markdownForCopy(editor, "page");
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });
});
