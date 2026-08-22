import type { Editor } from "@tiptap/core";

type TableNode = {
  type: { name: string };
  nodeSize: number;
  childCount: number;
  child: (index: number) => { childCount: number; nodeSize: number };
  forEach: (fn: (row: { childCount: number; nodeSize: number }, offset: number, index: number) => void) => void;
};

export type TableLocation = {
  tablePos: number;
  table: TableNode;
  row: number;
  col: number;
  rows: number;
  cols: number;
};

export function locateTable(editor: Editor): TableLocation | null {
  const { $from } = editor.state.selection;
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type.name !== "table") depth -= 1;
  if (depth === 0) return null;
  const table = $from.node(depth) as unknown as TableNode;
  const tablePos = $from.before(depth);
  const rows = table.childCount;
  if (rows === 0) return null;
  let cols = 0;
  table.forEach((row) => {
    if (row.childCount > cols) cols = row.childCount;
  });
  if (cols === 0) return null;

  let row = 0;
  let col = 0;
  let found = false;
  table.forEach((rowNode, rowOffset, rowIndex) => {
    let cellOffset = 0;
    const rowPos = tablePos + 1 + rowOffset;
    for (let colIndex = 0; colIndex < rowNode.childCount; colIndex++) {
      const cell = (rowNode as unknown as { child: (i: number) => { nodeSize: number } }).child(colIndex);
      const cellPos = rowPos + 1 + cellOffset;
      if ($from.pos >= cellPos && $from.pos <= cellPos + cell.nodeSize) {
        row = rowIndex;
        col = colIndex;
        found = true;
      }
      cellOffset += cell.nodeSize;
    }
  });
  if (!found) return { tablePos, table, row: 0, col: 0, rows, cols };
  return { tablePos, table, row, col, rows, cols };
}

export function tableShape(editor: Editor): { rows: number; cols: number } | null {
  const hit = locateTable(editor);
  if (!hit) return null;
  return { rows: hit.rows, cols: hit.cols };
}

/** Drop the current column. The last column removes the table, not the rest of the page. */
export function deleteTableColumn(editor: Editor): boolean {
  const shape = tableShape(editor);
  if (!shape) return false;
  if (shape.cols <= 1) return editor.chain().focus().deleteTable().run();
  return editor.chain().focus().deleteColumn().run();
}

/** Drop the current row. The last row removes the table, not the rest of the page. */
export function deleteTableRow(editor: Editor): boolean {
  const shape = tableShape(editor);
  if (!shape) return false;
  if (shape.rows <= 1) return editor.chain().focus().deleteTable().run();
  return editor.chain().focus().deleteRow().run();
}

export function toggleTableHeaderRow(editor: Editor): boolean {
  if (!editor.isActive("table")) return false;
  return editor.chain().focus().toggleHeaderRow().run();
}
