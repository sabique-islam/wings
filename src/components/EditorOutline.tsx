import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { outlineFromJSON, type OutlineEntry } from "@/lib/editorOutline";
import { expandFoldedHeadingsOverPos, findBlockPosById, findHeadingPosByIndex, toggleHeadingCollapsedAt } from "@/components/BlockEditor/headingFold";

const OUTLINE_DEBOUNCE_MS = 300;

interface Props {
  editor: Editor;
}

function jumpTo(editor: Editor, entry: OutlineEntry, index: number) {
  const doc = editor.state.doc;
  let pos = entry.id ? findBlockPosById(doc as never, entry.id) : null;
  if (pos == null) pos = findHeadingPosByIndex(doc as never, index);
  if (pos == null) return;
  expandFoldedHeadingsOverPos(editor, pos);
  const heading = editor.state.doc.nodeAt(pos);
  if (heading?.type.name === "heading" && heading.attrs.collapsed) {
    toggleHeadingCollapsedAt(editor, pos);
  }
  editor.chain().focus().setTextSelection(pos + 1).run();
  requestAnimationFrame(() => {
    const el = editor.view.nodeDOM(pos!) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

export function EditorOutline({ editor }: Props) {
  const [entries, setEntries] = useState<OutlineEntry[]>(() => outlineFromJSON(editor.getJSON()));
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setEntries(outlineFromJSON(editor.getJSON())), OUTLINE_DEBOUNCE_MS);
    };
    refresh();
    editor.on("update", refresh);
    return () => {
      editor.off("update", refresh);
      if (timer) clearTimeout(timer);
    };
  }, [editor]);

  useEffect(() => {
    const root = editor.view.dom.closest(".overflow-y-auto") ?? editor.view.dom.parentElement;
    const headings = Array.from(editor.view.dom.querySelectorAll("h1, h2, h3"));
    if (!headings.length) return;
    const observer = new IntersectionObserver(
      (hits) => {
        const visible = hits
          .filter((hit) => hit.isIntersecting && hit.target.id)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      { root: root instanceof Element ? root : null, rootMargin: "-15% 0px -65% 0px", threshold: 0 },
    );
    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  }, [editor, entries]);

  if (!entries.length) return null;

  return (
    <nav className="editor-outline" aria-label="Outline" data-testid="editor-outline">
      <p className="editor-outline-label">Outline</p>
      <ul>
        {entries.map((entry, index) => {
          const active = (entry.id && entry.id === activeId) || (!entry.id && false);
          return (
            <li key={entry.id ?? `h-${index}-${entry.text}`}>
              <button
                type="button"
                className={`editor-outline-item${active ? " is-active" : ""}${entry.collapsed ? " is-collapsed" : ""}`}
                data-level={entry.level}
                onClick={() => jumpTo(editor, entry, index)}
              >
                {entry.collapsed ? "▸ " : ""}
                {entry.text || "Untitled"}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
