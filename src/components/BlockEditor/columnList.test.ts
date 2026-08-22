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

function columnCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "column") count += 1;
  });
  return count;
}

function placeCursorInEmptyParagraphAfter(editor: Editor, headingText: string) {
  let seenHeading = false;
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === "heading" && node.textContent === headingText) {
      seenHeading = true;
      return;
    }
    if (seenHeading && node.type.name === "paragraph" && node.textContent === "") {
      pos = nodePos + 1;
      return false;
    }
  });
  if (pos == null) throw new Error(`empty paragraph after "${headingText}" not found`);
  editor.commands.setTextSelection(pos);
}

function placeCursorInHeading(editor: Editor, text: string) {
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === "heading" && node.textContent === text) {
      pos = nodePos + 1;
      return false;
    }
  });
  if (pos == null) throw new Error(`heading "${text}" not found`);
  editor.commands.setTextSelection(pos);
}

const FIVE_DAY_ROW = `<h2>Week 1</h2><div data-type="column-list" data-cols="5">${[
  ["Sunday", "sun-todo"],
  ["Monday", "mon-todo"],
  ["Tuesday", "tue-todo"],
  ["Wednesday", "wed-todo"],
  ["Thursday", "thu-todo"],
]
  .map(
    ([day, todo]) =>
      `<div data-type="column"><h3>${day}</h3><p>${todo}</p></div>`,
  )
  .join("")}</div>`;

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

describe("column backspace containment", () => {
  it("deletes only the empty line in a day column, not the 5-day row", () => {
    const editor = makeEditor(
      FIVE_DAY_ROW.replace("<p>sun-todo</p>", "<p>sun-todo</p><p></p>"),
    );
    placeCursorInEmptyParagraphAfter(editor, "Sunday");
    editor.commands.keyboardShortcut("Backspace");

    expect(columnCount(editor)).toBe(5);
    expect(editor.state.doc.textContent).toContain("Monday");
    expect(editor.state.doc.textContent).toContain("mon-todo");
    expect(editor.state.doc.textContent).toContain("Sunday");
    expect(editor.state.doc.textContent).toContain("sun-todo");
    editor.destroy();
  });

  it("does not delete a columnList when Backspace hits the first empty block in a column", () => {
    const editor = makeEditor(
      `<h2>Week 1</h2><div data-type="column-list" data-cols="5"><div data-type="column"><p></p></div><div data-type="column"><h3>Monday</h3><p>keep</p></div><div data-type="column"><h3>Tuesday</h3><p>a</p></div><div data-type="column"><h3>Wednesday</h3><p>b</p></div><div data-type="column"><h3>Thursday</h3><p>c</p></div></div>`,
    );
    let emptyPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph" && node.textContent === "" && emptyPos == null) {
        emptyPos = pos + 1;
        return false;
      }
    });
    editor.commands.setTextSelection(emptyPos!);
    editor.commands.keyboardShortcut("Backspace");

    expect(columnCount(editor)).toBe(5);
    expect(editor.state.doc.textContent).toContain("Monday");
    expect(editor.state.doc.textContent).toContain("keep");
    const firstColumn = (() => {
      let col: { childCount: number } | null = null;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "column" && col == null) {
          col = node;
          return false;
        }
      });
      return col;
    })();
    expect(firstColumn?.childCount).toBeGreaterThanOrEqual(1);
    editor.destroy();
  });

  it("converts an empty day heading then keeps the rest of the row", () => {
    const editor = makeEditor(FIVE_DAY_ROW);
    let from = -1;
    let to = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading" && node.textContent === "Sunday") {
        from = pos + 1;
        to = pos + node.nodeSize - 1;
        return false;
      }
    });
    editor.commands.setTextSelection({ from, to });
    editor.commands.keyboardShortcut("Backspace");
    editor.commands.keyboardShortcut("Backspace");
    editor.commands.keyboardShortcut("Backspace");

    expect(columnCount(editor)).toBe(5);
    expect(editor.state.doc.textContent).toContain("Monday");
    expect(editor.state.doc.textContent).toContain("mon-todo");
    editor.destroy();
  });

  it("selects only the active column on the first Mod-a", () => {
    const editor = makeEditor(FIVE_DAY_ROW);
    placeCursorInHeading(editor, "Sunday");
    editor.commands.keyboardShortcut("Mod-a");
    const selected = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
    );
    expect(selected).toContain("Sunday");
    expect(selected).toContain("sun-todo");
    expect(selected).not.toContain("Monday");
    editor.destroy();
  });
});
