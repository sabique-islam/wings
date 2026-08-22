import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import { applyTsvPaste, tsvToTableJSON } from "./tableTsv";
import { tableShape } from "./tableCommands";

function makeEditor(content = "<p></p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

function cellPositions(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === "tableHeader" || node.type.name === "tableCell") {
      positions.push(nodePos);
    }
  });
  return positions;
}

function focusFirstTableCell(editor: Editor) {
  const pos = cellPositions(editor)[0];
  if (pos == null) throw new Error("no table cell");
  editor.commands.setTextSelection(pos + 1);
}

function cellTexts(editor: Editor): string[][] {
  const rows: string[][] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "tableRow") return;
    const row: string[] = [];
    node.forEach((cell) => row.push(cell.textContent));
    rows.push(row);
  });
  return rows;
}

describe("tsvToTableJSON", () => {
  it("uses a header row when there is more than one row", () => {
    const json = tsvToTableJSON(
      [
        ["a", "b"],
        ["1", "2"],
      ],
      true,
    );
    expect(json.content[0]?.content[0]?.type).toBe("tableHeader");
    expect(json.content[1]?.content[0]?.type).toBe("tableCell");
  });
});

describe("applyTsvPaste", () => {
  it("inserts a table from TSV outside a table", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.focus();
    expect(
      applyTsvPaste(
        editor,
        [
          ["Name", "Age"],
          ["Ada", "36"],
        ],
        "insert",
      ),
    ).toBe(true);
    expect(tableShape(editor) ?? cellTexts(editor).length).toBeTruthy();
    expect(editor.state.doc.textContent).toContain("Ada");
    expect(cellTexts(editor)[1]).toEqual(["Ada", "36"]);
    editor.destroy();
  });

  it("fills from the current cell and keeps neighbors", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false });
    focusFirstTableCell(editor);
    editor.commands.insertContent("keep");
    const second = cellPositions(editor)[1];
    if (second == null) throw new Error("no second cell");
    editor.commands.setTextSelection(second + 1);
    expect(
      applyTsvPaste(
        editor,
        [
          ["x", "y"],
          ["1", "2"],
        ],
        "fill",
      ),
    ).toBe(true);
    const rows = cellTexts(editor);
    expect(rows[0]?.[0]).toBe("keep");
    expect(rows[0]?.[1]).toBe("x");
    expect(rows[1]?.[0]).toBe("");
    expect(rows[1]?.[1]).toBe("1");
    expect(rows[0]?.[2]).toBe("y");
    expect(rows[1]?.[2]).toBe("2");
    editor.destroy();
  });
});
