import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { Rows3, Columns3, Trash2, Heading2, Minus } from "@/lib/icons";
import { deleteTableColumn, deleteTableRow, toggleTableHeaderRow } from "./tableCommands";

interface Props {
  editor: Editor;
}

/** Floating table controls when the cursor is inside a table. */
export function TableMenu({ editor }: Props) {
  return (
    <BubbleMenu
      editor={editor}
      className="bubble-menu"
      updateDelay={0}
      shouldShow={({ editor: ed }) => ed.isActive("table")}
    >
      <div className="table-menu" data-testid="table-menu">
        <button
          type="button"
          className="bubble-btn"
          title="Add row above"
          aria-label="Add row above"
          onClick={() => editor.chain().focus().addRowBefore().run()}
        >
          <Rows3 className="h-3.5 w-3.5" />
          ↑
        </button>
        <button
          type="button"
          className="bubble-btn"
          title="Add row below"
          aria-label="Add row below"
          onClick={() => editor.chain().focus().addRowAfter().run()}
        >
          <Rows3 className="h-3.5 w-3.5" />
          ↓
        </button>
        <button
          type="button"
          className="bubble-btn"
          title="Add column left"
          aria-label="Add column left"
          onClick={() => editor.chain().focus().addColumnBefore().run()}
        >
          <Columns3 className="h-3.5 w-3.5" />
          ←
        </button>
        <button
          type="button"
          className="bubble-btn"
          title="Add column right"
          aria-label="Add column right"
          onClick={() => editor.chain().focus().addColumnAfter().run()}
        >
          <Columns3 className="h-3.5 w-3.5" />
          →
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button
          type="button"
          className="bubble-btn"
          title="Delete row"
          aria-label="Delete row"
          onClick={() => deleteTableRow(editor)}
        >
          <Rows3 className="h-3.5 w-3.5" />
          <Minus className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="bubble-btn"
          title="Delete column"
          aria-label="Delete column"
          onClick={() => deleteTableColumn(editor)}
        >
          <Columns3 className="h-3.5 w-3.5" />
          <Minus className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="bubble-btn"
          title="Toggle header row"
          aria-label="Toggle header row"
          onClick={() => toggleTableHeaderRow(editor)}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="bubble-btn text-destructive"
          title="Delete table"
          aria-label="Delete table"
          onClick={() => editor.chain().focus().deleteTable().run()}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </BubbleMenu>
  );
}
