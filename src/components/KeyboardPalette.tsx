import { useState, useEffect } from "react";
import { Keyboard, X } from "@/lib/icons";

const shortcuts = [
  { keys: "⌘ F", desc: "Find in this page" },
  { keys: "⌘ K", desc: "Command palette (outside editor)" },
  { keys: "⌘ K", desc: "Insert link (in editor)" },
  { keys: "⌘ N", desc: "New page" },
  { keys: "⌘ P", desc: "Quick switcher" },
  { keys: "⌘ /", desc: "Search sidebar" },
  { keys: "⌘ J", desc: "Toggle AI assistant" },
  { keys: "⌘ B", desc: "Toggle sidebar / Bold in editor" },
  { keys: "⌘ ⇧ G", desc: "Graph view" },
  { keys: "[[", desc: "Link to a page (wikilink)" },
  { keys: "⌘ ?", desc: "Keyboard shortcuts" },
  { keys: "⌘ D", desc: "Duplicate block" },
  { keys: "⌘ ⇧ ↑/↓", desc: "Move block up/down" },
  { keys: "⌘ ⇧ C", desc: "Copy as markdown" },
  { keys: "⌘ U", desc: "Underline" },
  { keys: "⌘ ⇧ S", desc: "Strikethrough" },
  { keys: "⌘ I", desc: "Italic" },
  { keys: "⌘ E", desc: "Inline code" },
  { keys: "⌘ ⌥ 0–8", desc: "Turn into (text, h1–h3, lists, toggle, code)" },
  { keys: "Tab / ⇧Tab", desc: "Indent / outdent list" },
  { keys: "Esc", desc: "Select block" },
  { keys: "/", desc: "Slash commands (insert, dates, duplicate)" },
];

export function KeyboardPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "?") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("nw:shortcuts", handler);
    return () => window.removeEventListener("nw:shortcuts", handler);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-background/60" />
      <div
        className="relative bg-card border border-border rounded-lg shadow-2xl w-96 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 text-xs text-foreground font-mono">
            <Keyboard className="h-3.5 w-3.5" />
            <span>keyboard shortcuts</span>
          </div>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <ul className="py-2 max-h-96 overflow-y-auto">
          {shortcuts.map((s, i) => (
            <li key={`${s.keys}-${s.desc}-${i}`} className="flex items-center justify-between px-4 py-1.5">
              <span className="text-xs text-muted-foreground">{s.desc}</span>
              <kbd className="text-[10px] bg-secondary text-secondary-foreground px-2 py-0.5 rounded font-mono">{s.keys}</kbd>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground/30 font-mono">
          ⌘? to toggle
        </div>
      </div>
    </div>
  );
}
