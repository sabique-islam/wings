import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import {
  addParagraphAfterHeading,
  addParagraphAfterOutlineTitle,
  applyEnterMarkdownShortcut,
  mergeEmptyBlockUp,
} from "./writingKeys";

function makeEditor(content = "<p></p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

function placeAtEndOf(editor: Editor, type: string, text: string) {
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === type && node.textContent === text) {
      pos = nodePos + 1 + node.content.size;
      return false;
    }
  });
  if (pos == null) throw new Error(`${type} "${text}" not found`);
  editor.commands.setTextSelection(pos);
}

describe("addParagraphAfterHeading", () => {
  it("reuses the next empty paragraph instead of stacking another", () => {
    const editor = makeEditor("<h1>Title</h1><p></p>");
    placeAtEndOf(editor, "heading", "Title");
    expect(addParagraphAfterHeading(editor)).toBe(true);

    const types: string[] = [];
    editor.state.doc.forEach((child) => types.push(child.type.name));
    expect(types.filter((t) => t === "heading")).toHaveLength(1);
    expect(types.filter((t) => t === "paragraph").length).toBeGreaterThanOrEqual(1);
    expect(editor.state.doc.textContent).toBe("Title");
    editor.destroy();
  });

  it("inserts inside an outline instead of after the wrapper", () => {
    const editor = makeEditor(
      '<div data-type="heading" data-level="1"><h1>Title</h1><p>nested</p></div>',
    );
    placeAtEndOf(editor, "heading", "Title");
    expect(addParagraphAfterHeading(editor)).toBe(true);

    const top = editor.state.doc.firstChild;
    expect(top?.type.name).toBe("outlineBlock");
    const childTypes: string[] = [];
    top?.forEach((child) => childTypes.push(child.type.name));
    expect(childTypes[0]).toBe("heading");
    expect(childTypes).toContain("paragraph");
    expect(top?.textContent).toContain("Title");
    expect(top?.textContent).toContain("nested");
    expect(editor.state.selection.$from.node(editor.state.selection.$from.depth - 1)?.type.name).toBe(
      "outlineBlock",
    );
    editor.destroy();
  });

  it("keeps Enter on an outline paragraph title inside the outline", () => {
    const editor = makeEditor(
      '<div data-type="paragraph"><p>hello</p><p>world</p></div>',
    );
    placeAtEndOf(editor, "paragraph", "hello");
    expect(addParagraphAfterOutlineTitle(editor)).toBe(true);

    const top = editor.state.doc.firstChild;
    expect(top?.type.name).toBe("outlineBlock");
    expect(top?.textContent).toContain("hello");
    expect(top?.textContent).toContain("world");
    expect(editor.state.selection.$from.node(editor.state.selection.$from.depth - 1)?.type.name).toBe(
      "outlineBlock",
    );
    editor.destroy();
  });

  it("does not jump past a fence into trailing padding", () => {
    const editor = makeEditor("<h1>Title</h1><pre><code>keep</code></pre>");
    placeAtEndOf(editor, "heading", "Title");
    expect(addParagraphAfterHeading(editor)).toBe(true);

    const types: string[] = [];
    editor.state.doc.forEach((child) => types.push(child.type.name));
    expect(types[0]).toBe("heading");
    expect(types[1]).toBe("paragraph");
    expect(types).toContain("codeBlock");
    expect(editor.state.doc.textContent).toContain("keep");
    editor.destroy();
  });

  it("on a folded heading inserts after the hidden siblings, not inside them", () => {
    const editor = makeEditor("<h2>AlphaBeta</h2><p>secret</p><h2>Other</h2>");
    let headingPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading" && node.textContent === "AlphaBeta") {
        headingPos = pos;
        return false;
      }
    });
    editor.commands.setTextSelection(headingPos + 1);
    editor.commands.updateAttributes("heading", { collapsed: true });
    editor.commands.setTextSelection(headingPos + 1 + "Alpha".length);

    expect(addParagraphAfterHeading(editor)).toBe(true);

    const snapshot: string[] = [];
    editor.state.doc.forEach((child) => {
      snapshot.push(`${child.type.name}:${child.textContent}`);
    });
    expect(snapshot.filter((n) => n.startsWith("heading:"))).toHaveLength(2);
    const titleAt = snapshot.findIndex((n) => n.startsWith("heading:Alpha"));
    const otherAt = snapshot.findIndex((n) => n === "heading:Other");
    const inserted = snapshot.slice(titleAt + 1, otherAt);
    expect(inserted.some((n) => n.startsWith("paragraph:") && n.includes("Beta"))).toBe(true);
    expect(inserted.some((n) => n.includes("secret"))).toBe(true);
    editor.destroy();
  });
});

describe("applyEnterMarkdownShortcut", () => {
  it("turns a fence token into a code block", () => {
    const editor = makeEditor("<p>```ts</p>");
    placeAtEndOf(editor, "paragraph", "```ts");
    expect(applyEnterMarkdownShortcut(editor)).toBe(true);
    expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock");
    expect(editor.state.doc.firstChild?.attrs.language).toBe("typescript");
    editor.destroy();
  });

  it("turns four hyphens into a divider", () => {
    const editor = makeEditor("<p>----</p>");
    placeAtEndOf(editor, "paragraph", "----");
    expect(applyEnterMarkdownShortcut(editor)).toBe(true);
    let hr = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "horizontalRule") hr += 1;
    });
    expect(hr).toBe(1);
    editor.destroy();
  });
});

describe("mergeEmptyBlockUp", () => {
  it("moves from a later empty column into the previous column", () => {
    const editor = makeEditor(
      `<div data-type="column-list" data-cols="2"><div data-type="column"><h3>Monday</h3><p>keep</p></div><div data-type="column"><p></p></div></div>`,
    );
    let emptyPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph" && node.textContent === "" && emptyPos == null) {
        emptyPos = pos + 1;
        return false;
      }
    });
    editor.commands.setTextSelection(emptyPos!);
    expect(mergeEmptyBlockUp(editor)).toBe(true);

    let columns = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "column") columns += 1;
    });
    expect(columns).toBe(2);
    expect(editor.state.doc.textContent).toContain("keep");
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe("");
    expect(editor.state.doc.textContent.slice(0, editor.state.selection.from)).toContain("keep");
    editor.destroy();
  });
});
