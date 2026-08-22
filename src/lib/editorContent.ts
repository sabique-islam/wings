import type { JSONContent } from "@tiptap/core";
import { markdownToHtml } from "@/lib/markdown";

/** True when a paragraph (including nested empty outline children) has no text. */
function isEmptyParagraph(node: JSONContent): boolean {
  if (node.type !== "paragraph") return false;
  const inner = node.content;
  if (!inner?.length) return true;
  return inner.every((child) => {
    if (child.type === "text") return !child.text;
    if (child.type === "paragraph") return isEmptyParagraph(child);
    return false;
  });
}

/** True when TipTap JSON is an empty doc (or a single empty paragraph). */
export function isEmptyDoc(json: JSONContent | null | undefined): boolean {
  if (!json || json.type !== "doc") return true;
  const nodes = json.content;
  if (!nodes?.length) return true;
  if (nodes.length === 1 && nodes[0].type === "paragraph") {
    return isEmptyParagraph(nodes[0]);
  }
  if (nodes.length === 1 && nodes[0].type === "outlineBlock") {
    const inner = nodes[0].content;
    if (!inner?.length) return true;
    return inner.every((child) => child.type === "paragraph" && isEmptyParagraph(child));
  }
  return false;
}

/** Prefer real markdown over an empty content_json snapshot (regression guard). */
export function resolveInitialEditorContent(
  content: string,
  contentJson?: JSONContent | null,
  resolvePageId?: (title: string) => string | null,
): string | JSONContent {
  const markdown = content ?? "";
  const hasMarkdown = markdown.trim().length > 0;

  if (contentJson && typeof contentJson === "object" && contentJson.type === "doc" && !isEmptyDoc(contentJson)) {
    return contentJson;
  }

  if (hasMarkdown) {
    return markdownToHtml(markdown, resolvePageId);
  }

  if (contentJson && contentJson.type === "doc") {
    return contentJson;
  }

  return markdownToHtml(markdown, resolvePageId);
}

/**
 * Ignore local drafts that would wipe existing server content.
 *
 * A draft with no markdown can still hold real work — the editor writes
 * JSON-only drafts while the user is typing — so the JSON decides in that case.
 */
export function shouldApplyDraft(
  existingContent: string,
  draftMarkdown: string,
  draftJson?: JSONContent | null,
): boolean {
  if (draftMarkdown.trim().length > 0) return true;
  if (!isEmptyDoc(draftJson)) return true;
  return existingContent.trim().length === 0;
}

/** Block autosave that would replace substantial content with an empty doc. */
export function shouldBlockEmptySave(existingContent: string, nextMarkdown: string): boolean {
  const had = existingContent.trim().length;
  const next = nextMarkdown.trim().length;
  return had >= 20 && next === 0;
}

/** Block offline pending-write replay that would wipe server content. */
export function shouldReplayPendingWrite(serverContent: string, pendingMarkdown: string): boolean {
  return !shouldBlockEmptySave(serverContent, pendingMarkdown);
}

export interface DraftOverlay {
  markdown: string;
  json?: JSONContent | null;
}

/**
 * Merge a local draft into an entry row when the draft is allowed to win.
 *
 * Drafts are a client-side cache (see `draftCache.ts`), not source of truth.
 * Call after every path that replaces in-memory entries from server or
 * IndexedDB — initial hydrate, `loadEntries`, and active-page restore — so
 * fresher local work is not overwritten by a stale fetch.
 *
 * The typing path often stores JSON without markdown; preserve server
 * markdown in that case so empty-save guards still measure real content length.
 */
export function applyDraftToEntry<T extends { content: string; content_json?: JSONContent | null }>(
  entry: T,
  draft: DraftOverlay | null | undefined,
): T {
  if (draft == null) return entry;
  if (!shouldApplyDraft(entry.content, draft.markdown, draft.json)) return entry;
  if (entry.content === draft.markdown && entry.content_json === draft.json) return entry;
  // A JSON-only draft has no markdown to restore — keep the server copy so
  // the empty-save guard still measures against the real content length.
  const content = draft.markdown.trim().length > 0 ? draft.markdown : entry.content;
  return { ...entry, content, content_json: draft.json ?? entry.content_json };
}

function jsonSnapshot(json: JSONContent | null | undefined): string {
  return JSON.stringify(json ?? null);
}

/**
 * Whether BlockEditor should adopt new `content` / `contentJson` props.
 *
 * Persistence keeps `content` and `content_json` in sync on save, but between
 * saves the typing path emits JSON only (`BlockEditor.scheduleJsonEmit`).
 * After reload or draft merge, markdown may be unchanged while `content_json`
 * carries the latest document — prop sync must not key off markdown alone.
 */
export function shouldSyncEditorFromProps(
  content: string,
  contentJson: JSONContent | null | undefined,
  lastEmittedMarkdown: string,
  lastEmittedJson: JSONContent | null,
): boolean {
  if (content !== lastEmittedMarkdown) return true;
  if (isEmptyDoc(contentJson)) return false;
  return jsonSnapshot(contentJson) !== jsonSnapshot(lastEmittedJson);
}
