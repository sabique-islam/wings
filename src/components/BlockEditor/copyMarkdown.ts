import { getHTMLFromFragment, type Editor } from "@tiptap/core";
import { htmlToMarkdown } from "@/lib/markdown";
import { getTopLevelBlockPos, type BlockPos } from "./blockUtils";

export type CopyScope = "auto" | "block" | "page";

export type CopyRange = {
  from: number;
  to: number;
  kind: "selection" | "block" | "page";
};

/**
 * Selection if the user highlighted something, otherwise the current top-level
 * block, otherwise the whole page.
 */
export function resolveCopyRange(editor: Editor, scope: CopyScope = "auto"): CopyRange {
  const size = editor.state.doc.content.size;
  if (scope === "page") return { from: 0, to: size, kind: "page" };

  const { from, to, empty } = editor.state.selection;
  if (scope === "auto" && !empty && from !== to) {
    return { from, to, kind: "selection" };
  }

  const pos = getTopLevelBlockPos(editor.state.selection.$from as BlockPos);
  if (pos != null) {
    const node = editor.state.doc.nodeAt(pos);
    if (node) return { from: pos, to: pos + node.nodeSize, kind: "block" };
  }

  return { from: 0, to: size, kind: "page" };
}

export function sliceToHtml(editor: Editor, from: number, to: number): string {
  const size = editor.state.doc.content.size;
  const start = Math.max(0, Math.min(from, to));
  const end = Math.min(size, Math.max(from, to));
  if (end <= start) return "";
  if (start === 0 && end === size) return editor.getHTML();
  const slice = editor.state.doc.slice(start, end);
  if (slice.content.size === 0) return "";
  try {
    return getHTMLFromFragment(slice.content, editor.schema);
  } catch {
    return "";
  }
}

/** Same serializer the editor uses on save — do not invent a second one. */
export function sliceToMarkdown(editor: Editor, from: number, to: number): string {
  const html = sliceToHtml(editor, from, to);
  if (!html) return editor.state.doc.textBetween(from, to, "\n\n");
  return htmlToMarkdown(html);
}

export function sliceToPlaintext(editor: Editor, from: number, to: number): string {
  return editor.state.doc.textBetween(from, to, "\n\n").trimEnd();
}

export function markdownForCopy(editor: Editor, scope: CopyScope = "auto"): string {
  const { from, to } = resolveCopyRange(editor, scope);
  return sliceToMarkdown(editor, from, to);
}

export function plaintextForCopy(editor: Editor, scope: CopyScope = "auto"): string {
  const { from, to } = resolveCopyRange(editor, scope);
  return sliceToPlaintext(editor, from, to);
}

function writeClipboard(plain: string, html?: string): void {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  const fallback = () => {
    if (!navigator.clipboard.writeText) return;
    void navigator.clipboard.writeText(plain).catch(() => undefined);
  };
  if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    const item = new ClipboardItem({
      "text/plain": new Blob([plain], { type: "text/plain" }),
      "text/html": new Blob([html], { type: "text/html" }),
    });
    void navigator.clipboard.write([item]).catch(fallback);
    return;
  }
  fallback();
}

/** Copy markdown for the resolved range. Returns false when there is nothing to copy. */
export function copyAsMarkdown(editor: Editor, scope: CopyScope = "auto"): boolean {
  const { from, to } = resolveCopyRange(editor, scope);
  const markdown = sliceToMarkdown(editor, from, to);
  if (!markdown.trim()) return false;
  writeClipboard(markdown, sliceToHtml(editor, from, to));
  return true;
}

export function copyAsPlaintext(editor: Editor, scope: CopyScope = "auto"): boolean {
  const text = plaintextForCopy(editor, scope);
  if (!text.trim()) return false;
  writeClipboard(text);
  return true;
}

export function copyPageMarkdown(editor: Editor): boolean {
  return copyAsMarkdown(editor, "page");
}
