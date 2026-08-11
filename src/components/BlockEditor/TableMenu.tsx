import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { Rows3, Columns3, Trash2 } from "@/lib/icons";

interface Props {
  editor: Editor;
}

/** Floating table controls when the cursor is inside a table. */
export function TableMenu({ editor }: Props) {
  return (
    <BubbleMenu editor={editor} className="bubble-menu" shouldShow={({ editor: ed }) => ed.isActive("table")}>
      <button
        type="button"
        className="bubble-btn"
        title="Add row above"
        onClick={() => editor.chain().focus().addRowBefore().run()}
      >
        <Rows3 className="h-3.5 w-3.5" />
        ↑
      </button>
      <button
        type="button"
        className="bubble-btn"
        title="Add row below"
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        <Rows3 className="h-3.5 w-3.5" />
        ↓
      </button>
      <button
        type="button"
        className="bubble-btn"
        title="Add column left"
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      >
        <Columns3 className="h-3.5 w-3.5" />
        ←
      </button>
      <button
        type="button"
        className="bubble-btn"
        title="Add column right"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        <Columns3 className="h-3.5 w-3.5" />
        →
      </button>
      <button
        type="button"
        className="bubble-btn text-destructive"
        title="Delete table"
        onClick={() => editor.chain().focus().deleteTable().run()}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </BubbleMenu>
  );
}
