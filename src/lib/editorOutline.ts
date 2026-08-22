import type { JSONContent } from "@tiptap/core";

export interface OutlineEntry {
  id: string | null;
  level: number;
  text: string;
  collapsed: boolean;
}

function textOf(node: JSONContent): string {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(textOf).join("");
}

/** Headings in document order. Source of truth is TipTap JSON, not the DOM. */
export function outlineFromJSON(doc: JSONContent | null | undefined): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === "heading") {
      entries.push({
        id: typeof node.attrs?.id === "string" ? node.attrs.id : null,
        level: Number(node.attrs?.level ?? 1),
        text: textOf(node).trim(),
        collapsed: node.attrs?.collapsed === true,
      });
    }
    for (const child of node.content ?? []) visit(child);
  };
  if (doc) visit(doc);
  return entries;
}
