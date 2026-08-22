import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { htmlToMarkdown, markdownToHtml } from "@/lib/markdown";
import { createBlockEditorExtensions } from "./editorExtensions";
import { collapsedSiblings, toggleHeadingCollapsedAt } from "./headingFold";

function makeEditor(content = "<p></p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

describe("column list widths", () => {
  it("stores custom widths as data-widths and round-trips through markdown", () => {
    const editor = makeEditor();
    editor.commands.insertColumnList(3);
    editor.commands.updateAttributes("columnList", { widths: [2, 1, 1] });
    const html = editor.getHTML();
    expect(html).toContain('data-widths="2,1,1"');
    expect(html).not.toContain("nw-col-gap");

    const md = htmlToMarkdown(html);
    expect(md).toContain("data-widths");
    expect(markdownToHtml(md)).toContain('data-widths="2,1,1"');
    editor.destroy();
  });

  it("puts a resize handle on each column in the live view", () => {
    const editor = makeEditor();
    editor.commands.insertColumnList(2);
    expect(editor.view.dom.querySelectorAll(".nw-col-gap")).toHaveLength(2);
    editor.destroy();
  });

  it("keeps heading fold controls inside columns so a day can collapse", () => {
    const editor = makeEditor(
      '<div data-type="column-list" data-cols="2"><div data-type="column"><h3>Sunday</h3><p>todo</p></div><div data-type="column"><h3>Monday</h3><p>other</p></div></div>',
    );
    expect(editor.view.dom.querySelector(".nw-col .nw-heading-fold")).toBeTruthy();

    let sunday = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading" && node.textContent === "Sunday") {
        sunday = pos;
        return false;
      }
    });
    expect(sunday).toBeGreaterThanOrEqual(0);
    toggleHeadingCollapsedAt(editor, sunday);
    const sundayNode = editor.state.doc.nodeAt(sunday);
    expect(sundayNode?.attrs.collapsed).toBe(true);
    const range = collapsedSiblings(editor.state.doc as never, sunday);
    expect(range).not.toBeNull();
    const hidden = editor.state.doc.textBetween(range!.from, range!.to);
    expect(hidden).toContain("todo");
    expect(hidden).not.toContain("Monday");
    editor.destroy();
  });
});
