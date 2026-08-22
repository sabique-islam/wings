import { useEffect, useRef, useState, useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { toast } from "sonner";
import { turnInto, TURN_INTO_ITEMS, TEXT_COLORS, BG_COLORS, applyBackgroundColor, type TurnIntoType } from "./blockCommands";
import { deleteBlocksAtPositions, duplicateBlocksAtPositions } from "./blockUtils";
import { blockIdAt, blockLink, blocksToMarkdown, blocksToTitle } from "./blockTransfer";
import { fuzzyMatch } from "./blockCommands";

interface Props {
  editor: Editor | null;
}

/** Notion-style Cmd+/ action menu for selected block(s). */
export function BlockActionMenu({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [positions, setPositions] = useState<number[]>([]);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        positions: number[];
        x?: number;
        y?: number;
      };
      if (!editor || !detail.positions?.length) return;
      setPositions(detail.positions);
      setAnchor({ x: detail.x ?? 120, y: detail.y ?? 120 });
      setOpen(true);
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener("nw:blockActionMenu", handler);
    return () => window.removeEventListener("nw:blockActionMenu", handler);
  }, [editor]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!open || !editor) return null;

  const turnItems = TURN_INTO_ITEMS.filter(
    (t) => !query.trim() || fuzzyMatch(query, t.label) > 0,
  );

  const applyTurnInto = (type: TurnIntoType) => {
    for (const pos of [...positions].sort((a, b) => b - a)) {
      try {
        editor.chain().focus().setNodeSelection(pos).run();
        turnInto(editor, type);
      } catch {
        /* skip invalid pos */
      }
    }
    close();
  };

  const duplicate = () => {
    duplicateBlocksAtPositions(editor, positions);
    close();
  };

  const remove = () => {
    deleteBlocksAtPositions(editor, positions);
    close();
  };

  // The shell owns page creation and cross-page writes, so both handoffs pass
  // the extracted markdown outward rather than reaching for Supabase here.
  const turnIntoPage = () => {
    const markdown = blocksToMarkdown(editor, positions);
    if (!markdown.trim()) {
      toast.error("Nothing to turn into a page");
      return;
    }
    const title = blocksToTitle(editor, positions);
    deleteBlocksAtPositions(editor, positions);
    window.dispatchEvent(new CustomEvent("nw:turnIntoPage", { detail: { title, markdown } }));
    close();
  };

  const moveToPage = () => {
    const markdown = blocksToMarkdown(editor, positions);
    if (!markdown.trim()) {
      toast.error("Nothing to move");
      return;
    }
    // Blocks are removed only after the target page accepts them.
    window.dispatchEvent(
      new CustomEvent("nw:moveBlocksToPage", { detail: { markdown, positions } }),
    );
    close();
  };

  const copyBlockLink = async () => {
    const blockId = blockIdAt(editor, positions[0]!);
    if (!blockId) {
      toast.error("This block has no anchor yet");
      return;
    }
    try {
      await navigator.clipboard.writeText(blockLink(blockId));
      toast.success("Block link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
    close();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[210] min-w-[240px] rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
      style={{ left: anchor.x, top: anchor.y }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search actions…"
        className="w-full px-3 py-2 text-xs border-b border-border bg-transparent outline-none"
      />
      <div className="max-h-[280px] overflow-y-auto py-1">
        <p className="px-3 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/60">
          Turn into
        </p>
        {turnItems.map((t) => (
          <button
            key={t.type}
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted transition-colors"
            onClick={() => applyTurnInto(t.type)}
          >
            {t.label}
          </button>
        ))}
        <div className="my-1 border-t border-border" />
        <p className="px-3 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/60">
          Color
        </p>
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {TEXT_COLORS.slice(0, 6).map((c) => (
            <button
              key={c.label}
              type="button"
              className="color-swatch"
              style={{ background: c.value || "hsl(var(--foreground))" }}
              title={c.label}
              onClick={() => {
                if (c.value) editor.chain().focus().setColor(c.value).run();
                else editor.chain().focus().unsetColor().run();
                close();
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {BG_COLORS.slice(0, 6).map((c) => (
            <button
              key={`bg-${c.label}`}
              type="button"
              className="color-swatch border border-border"
              style={{ background: c.value || "transparent" }}
              title={c.label}
              onClick={() => {
                applyBackgroundColor(editor, c.value);
                close();
              }}
            />
          ))}
        </div>
        <div className="my-1 border-t border-border" />
        <button
          type="button"
          className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
          onClick={turnIntoPage}
        >
          Turn into page
        </button>
        <button
          type="button"
          className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
          onClick={moveToPage}
        >
          Move to…
        </button>
        <button
          type="button"
          className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
          onClick={copyBlockLink}
        >
          Copy link to block
        </button>
        <div className="my-1 border-t border-border" />
        <button
          type="button"
          className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
          onClick={duplicate}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="w-full px-3 py-1.5 text-left text-xs text-destructive hover:bg-muted"
          onClick={remove}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
