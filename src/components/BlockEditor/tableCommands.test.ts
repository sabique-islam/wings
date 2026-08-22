import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { htmlToMarkdown } from "@/lib/markdown";
import { shouldBlockEmptySave } from "@/lib/editorContent";
import { createBlockEditorExtensions } from "./editorExtensions";
import {
  deleteTableColumn,
  deleteTableRow,
  tableShape,
  toggleTableHeaderRow,
} from "./tableCommands";

function makeEditor(content = "<p></p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

function focusFirstTableCell(editor: Editor) {
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (pos != null) return false;
    if (node.type.name === "tableHeader" || node.type.name === "tableCell") {
      pos = nodePos + 1;
      return false;
    }
  });
  if (pos == null) throw new Error("no table cell");
  editor.commands.setTextSelection(pos);
}

function firstRowCellTypes(editor: Editor): string[] {
  const types: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "tableRow" && types.length === 0) {
      node.forEach((cell) => types.push(cell.type.name));
      return false;
    }
  });
  return types;
}

describe("tableShape", () => {
  it("reads rows and columns of the current table", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.insertTable({ rows: 2, cols: 3, withHeaderRow: true });
    focusFirstTableCell(editor);
    expect(tableShape(editor)).toEqual({ rows: 2, cols: 3 });
    editor.destroy();
  });
});

describe("deleteTableColumn", () => {
  it("does not delete neighboring text when dropping the last column", () => {
    const editor = makeEditor("<p>keep me around here</p>");
    editor.commands.focus("end");
    editor.commands.insertTable({ rows: 2, cols: 1, withHeaderRow: true });
    focusFirstTableCell(editor);
    expect(deleteTableColumn(editor)).toBe(true);
    expect(tableShape(editor)).toBeNull();
    expect(editor.state.doc.textContent).toContain("keep me around here");
    const next = htmlToMarkdown(editor.getHTML());
    expect(shouldBlockEmptySave("keep me around here extra", next)).toBe(false);
    editor.destroy();
  });

  it("removes one column when the table has more than one", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.insertTable({ rows: 2, cols: 3, withHeaderRow: true });
    focusFirstTableCell(editor);
    expect(deleteTableColumn(editor)).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 2, cols: 2 });
    editor.destroy();
  });
});

describe("deleteTableRow", () => {
  it("removes one row when the table has more than one", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.insertTable({ rows: 3, cols: 2, withHeaderRow: true });
    focusFirstTableCell(editor);
    expect(deleteTableRow(editor)).toBe(true);
    expect(tableShape(editor)).toEqual({ rows: 2, cols: 2 });
    editor.destroy();
  });
});

describe("toggleTableHeaderRow", () => {
  it("turns the first row from headers into cells", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    focusFirstTableCell(editor);
    expect(firstRowCellTypes(editor).every((name) => name === "tableHeader")).toBe(true);
    expect(toggleTableHeaderRow(editor)).toBe(true);
    expect(firstRowCellTypes(editor).every((name) => name === "tableCell")).toBe(true);
    editor.destroy();
  });
});
