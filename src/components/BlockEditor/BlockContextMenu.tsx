import { useEffect, useState, useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { turnInto, TURN_INTO_ITEMS } from "./blockCommands";
import { topLevelBlockPosAtCoords } from "./blockHit";
import { deleteBlocksAtPositions } from "./blockUtils";

interface Props {
  editor: Editor;
}

const ITEMS = TURN_INTO_ITEMS;

/** Notion-style right-click turn-into menu on the current block. */
export function BlockContextMenu({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const [blockPos, setBlockPos] = useState<number | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const el = editor.view.dom.closest(".block-editor-wrapper");
    if (!el) return;

    const onContext = (e: MouseEvent) => {
      if (!editor.isEditable) return;
      e.preventDefault();
      const pos = topLevelBlockPosAtCoords(editor.view, e.clientX, e.clientY);
      setBlockPos(pos);
      if (pos != null) editor.commands.setBlockSelection([pos], pos);
      setAnchor({ x: e.clientX, y: e.clientY });
      setOpen(true);
    };
    el.addEventListener("contextmenu", onContext as EventListener);
    return () => el.removeEventListener("contextmenu", onContext as EventListener);
  }, [editor]);

  useEffect(() => {
    if (!open) return;
    const onClick = () => close();
    window.addEventListener("click", onClick);
    window.addEventListener("scroll", onClick, true);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("scroll", onClick, true);
    };
  }, [open, close]);

  if (!open) return null;

  const targetPos = blockPos;

  return (
    <div
      className="fixed z-[200] min-w-[160px] rounded-md border border-border bg-popover py-1 shadow-md"
      style={{ left: anchor.x, top: anchor.y }}
      role="menu"
    >
      <p className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        Turn into
      </p>
      {ITEMS.map((item) => (
        <button
          key={item.type}
          type="button"
          role="menuitem"
          className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted transition-colors"
          onClick={() => {
            if (targetPos != null) {
              editor.commands.setBlockSelection([targetPos], targetPos);
              try {
                editor.commands.setNodeSelection(targetPos);
              } catch {
                /* atom or invalid pos — turnInto still runs on current selection */
              }
            }
            turnInto(editor, item.type);
            close();
          }}
        >
          {item.label}
        </button>
      ))}
      <div className="my-1 border-t border-border" />
      <button
        type="button"
        role="menuitem"
        className="w-full px-3 py-1.5 text-left text-xs text-destructive hover:bg-muted transition-colors"
        onClick={() => {
          if (targetPos != null) deleteBlocksAtPositions(editor, [targetPos]);
          close();
        }}
      >
        Delete block
      </button>
    </div>
  );
}
