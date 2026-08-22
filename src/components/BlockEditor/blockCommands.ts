import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { markdownToHtml } from "@/lib/markdown";
import { isAllowedEmbedUrl, isSafeHttpUrl } from "@/lib/safeUrl";
import {
  deleteBlocksAtPositions,
  findTopLevelDepth,
  getTopLevelBlockPos,
  type BlockPos,
} from "./blockUtils";
import { copyAsMarkdown } from "./copyMarkdown";

export interface BookmarkMeta {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
}

function bookmarkTitle(url: string, meta?: BookmarkMeta): string {
  if (meta?.title) return meta.title;
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function bookmarkAttrs(url: string, meta?: BookmarkMeta) {
  return {
    url,
    title: bookmarkTitle(url, meta),
    description: meta?.description ?? "",
    image: meta?.image ?? "",
    favicon: meta?.favicon ?? "",
  };
}

/**
 * Clipboard HTML from GitHub, YouTube, etc. is often a wrapper meta tag plus a
 * single anchor. Treat that as a bare URL paste so we don't also inline-link it.
 */
export function extractSingleLinkFromHtml(html: string): string | null {
  if (!html.includes("<")) return null;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll("meta, link, style").forEach((el) => el.remove());
    const anchors = Array.from(body.querySelectorAll("a[href]"));
    if (anchors.length !== 1) return null;
    const href = anchors[0]!.getAttribute("href")?.trim() ?? "";
    if (!isSafeHttpUrl(href)) return null;
    const text = body.textContent?.trim() ?? "";
    const linkText = anchors[0]!.textContent?.trim() ?? "";
    if (text === linkText || text === href || linkText === href) return href;
    return null;
  } catch {
    return null;
  }
}

export const TEXT_COLORS = [
  { label: "Default", value: "" },
  { label: "Gray", value: "#9b9a97" },
  { label: "Brown", value: "#64473a" },
  { label: "Orange", value: "#d9730d" },
  { label: "Yellow", value: "#dfab01" },
  { label: "Green", value: "#0f7b6c" },
  { label: "Blue", value: "#0b6e99" },
  { label: "Purple", value: "#6940a5" },
  { label: "Pink", value: "#ad1a72" },
  { label: "Red", value: "#e03e3e" },
];

export const BG_COLORS = [
  { label: "Default", value: "" },
  { label: "Gray", value: "#f1f1ef" },
  { label: "Brown", value: "#f4eeee" },
  { label: "Orange", value: "#fbecdd" },
  { label: "Yellow", value: "#fbf3db" },
  { label: "Green", value: "#edf3ec" },
  { label: "Blue", value: "#e7f3f8" },
  { label: "Purple", value: "#f6f3f9" },
  { label: "Pink", value: "#faf1f5" },
  { label: "Red", value: "#fdebec" },
];

export type TurnIntoType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote"
  | "codeBlock"
  | "toggle"
  | "callout";

/** Shared turn-into menu items for bubble, block, and context menus. */
export const TURN_INTO_ITEMS: { label: string; type: TurnIntoType }[] = [
  { label: "Text", type: "paragraph" },
  { label: "Heading 1", type: "heading1" },
  { label: "Heading 2", type: "heading2" },
  { label: "Heading 3", type: "heading3" },
  { label: "Bullet list", type: "bulletList" },
  { label: "Numbered list", type: "orderedList" },
  { label: "To-do list", type: "taskList" },
  { label: "Quote", type: "blockquote" },
  { label: "Code", type: "codeBlock" },
  { label: "Toggle", type: "toggle" },
  { label: "Callout", type: "callout" },
];

export function turnInto(editor: Editor, type: TurnIntoType): boolean {
  const chain = editor.chain().focus();
  switch (type) {
    case "paragraph":
      return chain.setParagraph().run();
    case "heading1":
      return chain.setHeading({ level: 1 }).run();
    case "heading2":
      return chain.setHeading({ level: 2 }).run();
    case "heading3":
      return chain.setHeading({ level: 3 }).run();
    case "bulletList":
      return chain.toggleBulletList().run();
    case "orderedList":
      return chain.toggleOrderedList().run();
    case "taskList":
      return chain.toggleTaskList().run();
    case "blockquote":
      return chain.setBlockquote().run();
    case "codeBlock":
      return chain.setCodeBlock().run();
    case "toggle":
      return chain.setToggleBlock().run();
    case "callout":
      return chain.setCallout().run();
    default:
      return false;
  }
}

export function insertColumns(editor: Editor, count: 2 | 3): void {
  const cols = Array.from({ length: count }, () => ({
    type: "column",
    content: [{ type: "paragraph" }],
  }));
  editor.chain().focus().insertContent({ type: "columnList", content: cols }).run();
}

export function insertBookmark(editor: Editor, url: string, meta?: BookmarkMeta): boolean {
  if (!isSafeHttpUrl(url)) return false;
  return editor
    .chain()
    .focus()
    .setMeta("preventAutolink", true)
    .insertBookmark(bookmarkAttrs(url, meta))
    .run();
}

/**
 * Paste a bare external URL as a single bookmark block, synchronously, so the
 * default paste path cannot also leave the raw URL in the paragraph.
 * Returns the bookmark's document position for a later metadata patch.
 */
export function pasteExternalUrl(editor: Editor, url: string): number | null {
  if (!isSafeHttpUrl(url)) return null;
  const attrs = bookmarkAttrs(url);
  const { state } = editor;
  const { $from } = state.selection;
  const blockPos = getTopLevelBlockPos($from as BlockPos);
  if (blockPos == null) return null;

  const block = state.doc.nodeAt(blockPos);
  if (!block) return null;

  const blockText = block.textContent.trim();
  const replaceBlock = blockText === "" || blockText === url.trim();

  if (replaceBlock) {
    const bookmark = state.schema.nodes.bookmark.create(attrs);
    const tr = state.tr
      .replaceWith(blockPos, blockPos + block.nodeSize, bookmark)
      .setMeta("preventAutolink", true)
      .scrollIntoView();
    editor.view.dispatch(tr);
    return blockPos;
  }

  const ok = editor
    .chain()
    .focus()
    .setMeta("preventAutolink", true)
    .insertContent({ type: "bookmark", attrs })
    .run();
  if (!ok) return null;

  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "bookmark" && node.attrs.url === url && found == null) {
      found = pos;
    }
  });
  return found;
}

/** Patch preview metadata onto a bookmark that was inserted by pasteExternalUrl. */
export function updateBookmarkMeta(editor: Editor, pos: number, meta: BookmarkMeta): boolean {
  let node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "bookmark") return false;

  const url = node.attrs.url as string;
  const tr = editor.state.tr
    .setNodeMarkup(pos, undefined, {
      ...node.attrs,
      title: meta.title ?? bookmarkTitle(url, meta),
      description: meta.description ?? node.attrs.description ?? "",
      image: meta.image ?? node.attrs.image ?? "",
      favicon: meta.favicon ?? node.attrs.favicon ?? "",
    })
    .setMeta("preventAutolink", true);
  editor.view.dispatch(tr);
  return true;
}

export function insertEmbed(editor: Editor, url: string): boolean {
  let embedUrl = url;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
  // Reject anything not on the https embed allowlist so unsupported/hostile
  // URLs never reach the iframe node.
  if (!isAllowedEmbedUrl(embedUrl)) return false;
  return editor.chain().focus().insertEmbed({ url, embedUrl }).run();
}

export function insertTemplateMarkdown(editor: Editor, markdown: string): void {
  editor.chain().focus().insertContent(markdownToHtml(markdown)).run();
}

/** Move the current top-level block one slot among its siblings. */
export function moveBlock(editor: Editor, direction: "up" | "down"): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  const depth = findTopLevelDepth($from as BlockPos);
  if (depth < 1) return false;

  const parent = $from.node(depth - 1);
  const indexInParent = $from.index(depth - 1);
  const targetIndex = direction === "up" ? indexInParent - 1 : indexInParent + 1;
  if (targetIndex < 0 || targetIndex >= parent.childCount) return false;

  const blockPos = $from.before(depth);
  const block = parent.child(indexInParent);
  const sibling = parent.child(targetIndex);

  const tr = state.tr;
  if (direction === "up") {
    const siblingPos = blockPos - sibling.nodeSize;
    tr.delete(blockPos, blockPos + block.nodeSize);
    tr.insert(siblingPos, block);
    tr.setSelection(TextSelection.near(tr.doc.resolve(siblingPos + 1)));
  } else {
    const afterSiblingPos = blockPos + block.nodeSize + sibling.nodeSize;
    tr.insert(afterSiblingPos, block);
    tr.delete(blockPos, blockPos + block.nodeSize);
    const finalPos = blockPos + sibling.nodeSize;
    tr.setSelection(TextSelection.near(tr.doc.resolve(finalPos + 1)));
  }
  tr.scrollIntoView();
  view.dispatch(tr);
  return true;
}

/** Insert a copy of the current top-level block immediately after it. */
export function duplicateBlock(editor: Editor): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  const depth = findTopLevelDepth($from as BlockPos);
  if (depth < 1) return false;

  const blockPos = $from.before(depth);
  const block = $from.node(depth);
  const insertPos = blockPos + block.nodeSize;

  const tr = state.tr.insert(insertPos, block.copy(block.content));
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
  tr.scrollIntoView();
  view.dispatch(tr);
  return true;
}

/** Delete the current top-level block. TrailingNode keeps a last paragraph. */
export function deleteCurrentBlock(editor: Editor): boolean {
  const pos = getTopLevelBlockPos(editor.state.selection.$from as BlockPos);
  if (pos == null) return false;
  return deleteBlocksAtPositions(editor, [pos]);
}

/** Copy the current top-level block as markdown (and HTML when the clipboard allows). */
export function copyCurrentBlock(editor: Editor): boolean {
  return copyAsMarkdown(editor, "block");
}

/** Simple fuzzy score — higher is better. */
export function fuzzyMatch(query: string, text: string, aliases: string[] = []): number {
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const targets = [text, ...aliases].map((t) => t.toLowerCase());
  for (const t of targets) {
    if (t === q) return 100;
    if (t.startsWith(q)) return 80;
    if (t.includes(q)) return 60;
    // subsequence
    let qi = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) qi++;
    }
    if (qi === q.length) return 40;
  }
  return 0;
}
