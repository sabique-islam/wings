import type { Editor } from "@tiptap/core";
import type { TsvPasteMode } from "./pasteDecision";
import { locateTable } from "./tableCommands";

function paragraphJSON(text: string) {
  if (!text) return { type: "paragraph" };
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function cellJSON(type: "tableCell" | "tableHeader", text: string) {
  return { type, content: [paragraphJSON(text)] };
}

export function tsvToTableJSON(grid: string[][], withHeaderRow: boolean) {
  return {
    type: "table",
    content: grid.map((row, rowIndex) => ({
      type: "tableRow",
      content: row.map((text) =>
        cellJSON(withHeaderRow && rowIndex === 0 ? "tableHeader" : "tableCell", text),
      ),
    })),
  };
}

function fillExistingTable(editor: Editor, tsv: string[][]): boolean {
  const hit = locateTable(editor);
  if (!hit) return false;
  const { state } = editor;
  const tableNode = state.doc.nodeAt(hit.tablePos);
  if (!tableNode || tableNode.type.name !== "table") return false;

  const tsvWidth = Math.max(...tsv.map((row) => row.length), 0);
  let existingCols = 0;
  tableNode.forEach((row) => {
    existingCols = Math.max(existingCols, row.childCount);
  });
  const rows = Math.max(tableNode.childCount, hit.row + tsv.length);
  const cols = Math.max(existingCols, hit.col + tsvWidth);

  const jsonRows = [];
  for (let r = 0; r < rows; r++) {
    const srcRow = r < tableNode.childCount ? tableNode.child(r) : null;
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const tsvRow = r - hit.row;
      const tsvCol = c - hit.col;
      const overlay = tsvRow >= 0 && tsvCol >= 0 && tsvRow < tsv.length && tsvCol < (tsv[tsvRow]?.length ?? 0);
      const srcCell = srcRow && c < srcRow.childCount ? srcRow.child(c) : null;
      if (overlay) {
        const type = srcCell?.type.name === "tableHeader" ? "tableHeader" : "tableCell";
        cells.push(cellJSON(type, tsv[tsvRow]![tsvCol]!));
      } else if (srcCell) {
        cells.push(srcCell.toJSON());
      } else {
        cells.push(cellJSON("tableCell", ""));
      }
    }
    jsonRows.push({ type: "tableRow", content: cells });
  }

  const replacement = state.schema.nodeFromJSON({
    type: "table",
    attrs: tableNode.attrs,
    content: jsonRows,
  });
  const tr = state.tr
    .replaceWith(hit.tablePos, hit.tablePos + tableNode.nodeSize, replacement)
    .scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}

function insertTableFromTsv(editor: Editor, tsv: string[][]): boolean {
  return editor.chain().focus().insertContent(tsvToTableJSON(tsv, tsv.length > 1)).run();
}

export function applyTsvPaste(editor: Editor, tsv: string[][], mode: TsvPasteMode): boolean {
  if (mode === "fill") return fillExistingTable(editor, tsv);
  if (mode === "insert") return insertTableFromTsv(editor, tsv);
  return false;
}
