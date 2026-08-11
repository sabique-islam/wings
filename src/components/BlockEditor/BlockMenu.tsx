import { useEffect, useState, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { turnInto, TURN_INTO_ITEMS, TEXT_COLORS, BG_COLORS } from "./blockCommands";
import { Trash2, Copy, ChevronRight } from "@/lib/icons";

const TURN_INTO = TURN_INTO_ITEMS;

interface Props {
  editor: Editor | null;
  onDeleteBlock?: () => void;
}

export function BlockMenu({ editor, onDeleteBlock }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(0);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const [submenu, setSubmenu] = useState<"turn" | "color" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { pos: number; x?: number; y?: number };
      if (!editor || detail.pos == null) return;
      setPos(detail.pos);
      setAnchor({ x: detail.x ?? 80, y: detail.y ?? 120 });
      setOpen(true);
      setSubmenu(null);
      try {
        const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, detail.pos));
        editor.view.dispatch(tr);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("nw:blockMenu", handler);
    return () => window.removeEventListener("nw:blockMenu", handler);
  }, [editor]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        window.dispatchEvent(new CustomEvent("nw:blockMenu:close"));
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        window.dispatchEvent(new CustomEvent("nw:blockMenu:close"));
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open || !editor) return null;

  const duplicate = () => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
    setOpen(false);
    window.dispatchEvent(new CustomEvent("nw:blockMenu:close"));
  };

  const deleteBlock = () => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
    onDeleteBlock?.();
    setOpen(false);
    window.dispatchEvent(new CustomEvent("nw:blockMenu:close"));
  };

  return (
    <div
      ref={menuRef}
      className="block-menu fixed z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[200px] text-sm"
      style={{ left: anchor.x, top: anchor.y }}
    >
      <button
        type="button"
        className="block-menu-item w-full flex items-center justify-between"
        onMouseEnter={() => setSubmenu("turn")}
      >
        <span>Turn into</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      {submenu === "turn" && (
        <div className="block-menu-submenu">
          {TURN_INTO.map((t) => (
            <button
              key={t.type}
              type="button"
              className="block-menu-item w-full text-left"
              onClick={() => {
                turnInto(editor, t.type);
                setOpen(false);
                window.dispatchEvent(new CustomEvent("nw:blockMenu:close"));
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="block-menu-item w-full flex items-center justify-between"
        onMouseEnter={() => setSubmenu("color")}
      >
        <span>Color</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      {submenu === "color" && (
        <div className="block-menu-submenu block-menu-colors">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Text</p>
          <div className="flex flex-wrap gap-1 px-2 pb-2">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                className="color-swatch"
                style={{ background: c.value || "hsl(var(--foreground))" }}
                title={c.label}
                onClick={() => {
                  if (c.value) editor.chain().focus().setColor(c.value).run();
                  else editor.chain().focus().unsetColor().run();
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent("nw:blockMenu:close"));
                }}
              />
            ))}
          </div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Background</p>
          <div className="flex flex-wrap gap-1 px-2 pb-2">
            {BG_COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                className="color-swatch border border-border"
                style={{ background: c.value || "transparent" }}
                title={c.label}
                onClick={() => {
                  if (c.value) editor.chain().focus().toggleHighlight({ color: c.value }).run();
                  else editor.chain().focus().unsetHighlight().run();
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent("nw:blockMenu:close"));
                }}
              />
            ))}
          </div>
        </div>
      )}
      <button type="button" className="block-menu-item w-full flex items-center gap-2" onClick={duplicate}>
        <Copy className="h-3.5 w-3.5" /> Duplicate <span className="ml-auto text-[10px] text-muted-foreground">⌘D</span>
      </button>
      <button type="button" className="block-menu-item w-full flex items-center gap-2 text-destructive" onClick={deleteBlock}>
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </button>
    </div>
  );
}
