/**
 * blank-gap click: put the caret in an empty paragraph at the end of
 * the page. Inserts one only when the last block is not already empty.
 * Never replaces the document.
 */
export function focusEndOfPage(editor: {
  isDestroyed?: boolean;
  isEditable?: boolean;
  commands: { focus: (position?: string | number) => boolean };
  chain: () => {
    focus: () => {
      insertContentAt: (pos: number, content: { type: string }) => { run: () => boolean };
    };
  };
  state: {
    doc: {
      lastChild: { type: { name: string }; content: { size: number } } | null;
      content: { size: number };
    };
  };
} | null | undefined): boolean {
  if (!editor || editor.isDestroyed || editor.isEditable === false) return false;
  const last = editor.state.doc.lastChild;
  if (last?.type.name === "paragraph" && last.content.size === 0) {
    return editor.commands.focus("end");
  }
  return editor
    .chain()
    .focus()
    .insertContentAt(editor.state.doc.content.size, { type: "paragraph" })
    .run();
}
