import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import { collapsedSiblings, findHeadingPosByIndex, headingsHidingPos } from "./headingFold";
import { htmlToMarkdown, markdownToHtml } from "@/lib/markdown";
import { isEmptyDoc } from "@/lib/editorContent";

function makeEditor(content: string) {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

function headingPos(editor: Editor, text: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.textContent === text) {
      found = pos;
      return false;
    }
  });
  if (found < 0) throw new Error(`heading "${text}" not found`);
  return found;
}

describe("collapsedSiblings", () => {
  it("hides following blocks until the next heading of the same or higher level", () => {
    const editor = makeEditor("<h2>Alpha</h2><p>one</p><h3>Nested</h3><p>two</p><h2>Beta</h2><p>three</p>");
    const range = collapsedSiblings(editor.state.doc as never, headingPos(editor, "Alpha"));
    expect(range).not.toBeNull();
    const hidden = editor.state.doc.textBetween(range!.from, range!.to);
    expect(hidden).toContain("one");
    expect(hidden).toContain("Nested");
    expect(hidden).toContain("two");
    expect(hidden).not.toContain("Beta");
    expect(hidden).not.toContain("three");
    editor.destroy();
  });

  it("stops an h1 fold at the next h1", () => {
    const editor = makeEditor("<h1>Top</h1><p>a</p><h2>Sub</h2><p>b</p><h1>Next</h1><p>c</p>");
    const range = collapsedSiblings(editor.state.doc as never, headingPos(editor, "Top"));
    expect(range).not.toBeNull();
    const hidden = editor.state.doc.textBetween(range!.from, range!.to);
    expect(hidden).toContain("a");
    expect(hidden).toContain("Sub");
    expect(hidden).not.toContain("Next");
    editor.destroy();
  });

  it("returns null when nothing follows the heading", () => {
    const editor = makeEditor("<h2>Alone</h2>");
    expect(collapsedSiblings(editor.state.doc as never, headingPos(editor, "Alone"))).toBeNull();
    editor.destroy();
  });

  it("counts an outline wrapper titled with a heading as that heading level", () => {
    const editor = makeEditor(
      '<h2>Alpha</h2><p>one</p><div data-type="heading"><h2>Peer</h2><p>inside</p></div><p>tail</p>',
    );
    const range = collapsedSiblings(editor.state.doc as never, headingPos(editor, "Alpha"));
    expect(range).not.toBeNull();
    const hidden = editor.state.doc.textBetween(range!.from, range!.to);
    expect(hidden).toContain("one");
    expect(hidden).not.toContain("Peer");
    expect(hidden).not.toContain("inside");
    editor.destroy();
  });

  it("hides an outline titled with a lower-level heading", () => {
    const editor = makeEditor(
      '<h2>Alpha</h2><div data-type="heading"><h3>Kid</h3><p>inside</p></div><h2>Beta</h2>',
    );
    const range = collapsedSiblings(editor.state.doc as never, headingPos(editor, "Alpha"));
    expect(range).not.toBeNull();
    const hidden = editor.state.doc.textBetween(range!.from, range!.to);
    expect(hidden).toContain("Kid");
    expect(hidden).toContain("inside");
    expect(hidden).not.toContain("Beta");
    editor.destroy();
  });
});

describe("heading fold persistence", () => {
  it("keeps hidden siblings in JSON after collapsing", () => {
    const editor = makeEditor("<h2>Alpha</h2><p>secret body</p><h2>Beta</h2>");
    const alpha = headingPos(editor, "Alpha");
    editor.commands.setTextSelection(alpha + 1);
    editor.commands.updateAttributes("heading", { collapsed: true });

    const json = editor.getJSON();
    expect(JSON.stringify(json)).toContain("secret body");
    expect(JSON.stringify(json)).toContain("Beta");
    expect(isEmptyDoc(json)).toBe(false);
    expect(htmlToMarkdown(editor.getHTML())).toContain("data-collapsed");

    const bodyPos = alpha + (editor.state.doc.nodeAt(alpha)?.nodeSize ?? 0);
    expect(headingsHidingPos(editor.state.doc as never, bodyPos)).toContain(alpha);
    expect(findHeadingPosByIndex(editor.state.doc as never, 1)).toBe(headingPos(editor, "Beta"));

    const md = htmlToMarkdown(editor.getHTML());
    expect(md).toContain("secret body");
    const html = markdownToHtml(md);
    expect(html).toContain("data-collapsed");
    expect(html).toContain("secret body");
    editor.destroy();
  });

  it("stores heading fill as data-bg so dark theme CSS can restyle the bar", () => {
    const editor = makeEditor('<h3 data-bg="#f1f1ef">Sunday</h3>');
    const html = editor.getHTML();
    expect(html).toContain('data-bg="#f1f1ef"');
    expect(html).not.toMatch(/style="[^"]*background-color:\s*#f1f1ef/i);
    editor.destroy();
  });
});
