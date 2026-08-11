import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Plus, Trash2 } from "@/lib/icons";

export type DatabaseColumnType = "text" | "status" | "date";

export interface DatabaseColumn {
  id: string;
  name: string;
  type: DatabaseColumnType;
}

export interface DatabaseRow {
  id: string;
  cells: Record<string, string>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    database: {
      insertDatabase: () => ReturnType;
    };
  }
}

function newId(): string {
  return `db-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultDatabaseAttrs(): { columns: DatabaseColumn[]; rows: DatabaseRow[] } {
  const nameCol: DatabaseColumn = { id: newId(), name: "Name", type: "text" };
  const statusCol: DatabaseColumn = { id: newId(), name: "Status", type: "status" };
  return {
    columns: [nameCol, statusCol],
    rows: [
      { id: newId(), cells: { [nameCol.id]: "", [statusCol.id]: "Not started" } },
      { id: newId(), cells: { [nameCol.id]: "", [statusCol.id]: "Not started" } },
    ],
  };
}

function parseJsonAttr<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const STATUS_OPTIONS = ["Not started", "In progress", "Blocked", "Done"];

function DatabaseView({ node, updateAttributes, editor }: NodeViewProps) {
  const columns = (node.attrs.columns as DatabaseColumn[]) ?? [];
  const rows = (node.attrs.rows as DatabaseRow[]) ?? [];
  const editable = editor.isEditable;

  const setColumns = (next: DatabaseColumn[]) => updateAttributes({ columns: next });
  const setRows = (next: DatabaseRow[]) => updateAttributes({ rows: next });

  const setCell = (rowId: string, colId: string, value: string) => {
    setRows(
      rows.map((row) =>
        row.id === rowId ? { ...row, cells: { ...row.cells, [colId]: value } } : row,
      ),
    );
  };

  const addRow = () => {
    const cells: Record<string, string> = {};
    for (const col of columns) {
      cells[col.id] = col.type === "status" ? "Not started" : "";
    }
    setRows([...rows, { id: newId(), cells }]);
  };

  const removeRow = (rowId: string) => setRows(rows.filter((row) => row.id !== rowId));

  const addColumn = () => {
    const col: DatabaseColumn = { id: newId(), name: "Column", type: "text" };
    setColumns([...columns, col]);
    setRows(rows.map((row) => ({ ...row, cells: { ...row.cells, [col.id]: "" } })));
  };

  const renameColumn = (colId: string, name: string) => {
    setColumns(columns.map((col) => (col.id === colId ? { ...col, name } : col)));
  };

  return (
    <NodeViewWrapper className="database-block" data-type="database" contentEditable={false}>
      <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-0">
        <table className="w-full text-sm border-collapse min-w-[320px]">
          <thead>
            <tr className="border-b border-border-subtle bg-muted/30">
              {columns.map((col) => (
                <th key={col.id} className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                  {editable ? (
                    <input
                      className="w-full bg-transparent outline-none text-xs font-medium"
                      value={col.name}
                      onChange={(e) => renameColumn(col.id, e.target.value)}
                    />
                  ) : (
                    col.name
                  )}
                </th>
              ))}
              {editable && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border-subtle last:border-0">
                {columns.map((col) => (
                  <td key={col.id} className="px-2 py-1 align-middle">
                    {col.type === "status" && editable ? (
                      <select
                        className="w-full bg-transparent text-xs outline-none"
                        value={row.cells[col.id] ?? "Not started"}
                        onChange={(e) => setCell(row.id, col.id, e.target.value)}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : col.type === "date" && editable ? (
                      <input
                        type="date"
                        className="w-full bg-transparent text-xs outline-none"
                        value={row.cells[col.id] ?? ""}
                        onChange={(e) => setCell(row.id, col.id, e.target.value)}
                      />
                    ) : editable ? (
                      <input
                        className="w-full bg-transparent text-xs outline-none"
                        value={row.cells[col.id] ?? ""}
                        onChange={(e) => setCell(row.id, col.id, e.target.value)}
                        placeholder="Empty"
                      />
                    ) : (
                      <span className="text-xs">{row.cells[col.id] || "—"}</span>
                    )}
                  </td>
                ))}
                {editable && (
                  <td className="px-1">
                    <button
                      type="button"
                      className="p-1 rounded text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(row.id)}
                      aria-label="Delete row"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {editable && (
          <div className="flex gap-2 px-2 py-1.5 border-t border-border-subtle">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={addRow}
            >
              <Plus className="h-3 w-3" /> Row
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={addColumn}
            >
              <Plus className="h-3 w-3" /> Column
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const Database = Node.create({
  name: "database",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    const defaults = defaultDatabaseAttrs();
    return {
      columns: {
        default: defaults.columns,
        parseHTML: (el) => parseJsonAttr(el.getAttribute("data-columns"), defaults.columns),
        renderHTML: (attrs) => ({ "data-columns": JSON.stringify(attrs.columns ?? []) }),
      },
      rows: {
        default: defaults.rows,
        parseHTML: (el) => parseJsonAttr(el.getAttribute("data-rows"), defaults.rows),
        renderHTML: (attrs) => ({ "data-rows": JSON.stringify(attrs.rows ?? []) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="database"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "database" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DatabaseView);
  },

  addCommands() {
    return {
      insertDatabase:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: defaultDatabaseAttrs() }),
    };
  },
});
