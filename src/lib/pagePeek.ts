import type { JSONContent } from "@tiptap/core";

export const PEEK_OPEN_EVENT = "nw:peek";
export const PEEK_CLOSE_EVENT = "nw:peek-close";

export type PeekEntry = {
  id: string;
  title: string;
  content: string;
  content_json: JSONContent | null;
};

/** Shift-click peeks; a plain click still navigates. */
export function pageLinkShiftClick(shiftKey: boolean): "peek" | "navigate" {
  return shiftKey ? "peek" : "navigate";
}

/** A peek editor never navigates away — a new target replaces the open modal. */
export function pageLinkClickAction(opts: {
  peekEditor: boolean;
  shiftKey: boolean;
}): "peek" | "navigate" {
  if (opts.peekEditor) return "peek";
  return pageLinkShiftClick(opts.shiftKey);
}

/** One slot: a new peek replaces the current one, never stacks. */
export function nextPeekPageId(_current: string | null, incoming: string): string | null {
  const pageId = incoming.trim();
  return pageId || null;
}

export function resolvePeekEntry(
  pageId: string,
  entries: ReadonlyArray<{
    id: string;
    title: string;
    content: string;
    content_json?: JSONContent | null;
  }>,
): PeekEntry | null {
  const id = pageId.trim();
  if (!id) return null;
  const entry = entries.find((item) => item.id === id);
  if (!entry) return null;
  return {
    id: entry.id,
    title: entry.title.trim() || "Untitled",
    content: entry.content ?? "",
    content_json: entry.content_json ?? null,
  };
}

/** Peek editors must not claim `__nw_editor` / flush — that is the live page. */
export function shouldHostEditorGlobals(peek: boolean): boolean {
  return !peek;
}

export function shouldEmitEditorChange(peek: boolean): boolean {
  return !peek;
}

export function peekEditorEntryId(pageId: string): string {
  return `peek:${pageId}`;
}

export function requestPagePeek(pageId: string): void {
  const id = pageId.trim();
  if (!id || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PEEK_OPEN_EVENT, { detail: id }));
}

export function requestClosePagePeek(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PEEK_CLOSE_EVENT));
}
