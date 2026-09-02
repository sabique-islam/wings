import type { Editor } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { pageIdFromHref } from "@/lib/linkExtraction";
import { fetchLinkPreview } from "@/lib/linkPreview";
import { isAllowedEmbedUrl, isSafeHttpUrl } from "@/lib/safeUrl";
import { rewriteEmbedUrl, updateBookmarkMeta } from "./blockCommands";
import { getTopLevelBlockPos, type BlockPos } from "./blockUtils";
import { normalizeExternalHref, openLinkHref } from "./editorLinkClick";
import { displayTitleForPage, PAGE_REF_NODE, pageRefHref } from "./pageRef";

export type LinkToolbarAction = "open" | "peek" | "copy" | "edit" | "unlink" | "bookmark" | "embed";
export type CardToolbarAction = "inline" | "card" | "embed" | "copy" | "open" | "reload" | "delete" | "list";
export type CardKind = "bookmark" | "embed";

export type ActiveLinkTarget =
  | { kind: "page"; href: string; pageId: string }
  | { kind: "http"; href: string; safeHref: string | null };

export function shouldShowEditorBubble(input: {
  editable: boolean;
  from: number;
  to: number;
  linkActive: boolean;
  pageRefActive: boolean;
  viewFocused: boolean;
  cardActive?: boolean;
}): boolean {
  if (!input.editable || !input.viewFocused) return false;
  if (input.cardActive) return true;
  if (input.linkActive || input.pageRefActive) return true;
  return input.from !== input.to;
}

/** Hide bold/italic/etc when the caret is in a link or a page chip is selected. */
export function shouldShowFormatButtons(input: {
  selectionEmpty: boolean;
  linkActive: boolean;
  pageRefActive: boolean;
  cardActive?: boolean;
}): boolean {
  if (input.cardActive) return false;
  if (input.pageRefActive) return false;
  if (input.selectionEmpty && input.linkActive) return false;
  return !input.selectionEmpty;
}

export function selectedCard(editor: Editor): { kind: CardKind; from: number; to: number; url: string; title: string } | null {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return null;
  const name = selection.node.type.name;
  if (name !== "bookmark" && name !== "embed") return null;
  return {
    kind: name,
    from: selection.from,
    to: selection.to,
    url: String(selection.node.attrs.url ?? ""),
    title: String(selection.node.attrs.title ?? ""),
  };
}

export function cardToolbarActions(kind: CardKind, url: string): CardToolbarAction[] {
  const actions: CardToolbarAction[] = ["inline", "card"];
  if (isAllowedEmbedUrl(rewriteEmbedUrl(url))) actions.push("embed");
  actions.push("copy", "open");
  if (kind === "bookmark") {
    actions.push("reload", "list");
  }
  actions.push("delete");
  return actions;
}

export function activeLinkTarget(editor: Editor): ActiveLinkTarget | null {
  const page = pageRefAtSelection(editor);
  if (page) return { kind: "page", href: pageRefHref(page.pageId), pageId: page.pageId };

  const href = linkHrefNearSelection(editor);
  if (!href) return null;
  const pageId = pageIdFromHref(href);
  if (pageId) return { kind: "page", href, pageId };
  return { kind: "http", href, safeHref: normalizeExternalHref(href) };
}

/** Link href at the caret, including exclusive edges (caret just after a pasted URL). */
export function linkHrefNearSelection(editor: Editor): string | null {
  const { state } = editor;
  const link = state.schema.marks.link;
  if (!link) return null;
  if (editor.isActive("link")) {
    const href = String(editor.getAttributes("link").href ?? "").trim();
    return href || null;
  }
  const { $from, from, to, empty } = state.selection;
  if (!empty && state.doc.rangeHasMark(from, to, link)) {
    let found = "";
    state.doc.nodesBetween(from, to, (node) => {
      if (found || !node.isText) return;
      const mark = node.marks.find((item) => item.type === link);
      if (mark) found = String(mark.attrs.href ?? "").trim();
    });
    return found || null;
  }
  const before = $from.nodeBefore;
  const after = $from.nodeAfter;
  const mark =
    before?.marks.find((item) => item.type === link) ?? after?.marks.find((item) => item.type === link);
  const href = mark ? String(mark.attrs.href ?? "").trim() : "";
  return href || null;
}

export function linkToolbarActions(target: ActiveLinkTarget | null): LinkToolbarAction[] {
  if (!target) return [];
  if (target.kind === "page") return ["open", "peek", "copy", "unlink"];
  if (!target.safeHref) return ["edit", "unlink"];
  const actions: LinkToolbarAction[] = ["open", "copy", "edit", "unlink"];
  if (isSafeHttpUrl(target.safeHref)) actions.push("bookmark");
  if (isAllowedEmbedUrl(rewriteEmbedUrl(target.safeHref))) actions.push("embed");
  return actions;
}

export function copyHrefForTarget(target: ActiveLinkTarget): string | null {
  if (target.kind === "page") return target.href;
  return target.safeHref;
}

export function hrefPreview(target: ActiveLinkTarget): string | null {
  if (target.kind === "page") return target.href;
  return target.safeHref;
}

export function openActiveLink(editor: Editor): boolean {
  const target = activeLinkTarget(editor);
  if (!target) return false;
  return openLinkHref(target.kind === "http" ? target.safeHref : target.href);
}

export function unlinkActiveLink(editor: Editor): boolean {
  const page = pageRefAtSelection(editor);
  if (page) return unwrapPageRef(editor, page);
  const range = linkMarkRangeAtSelection(editor);
  if (!range) return false;
  return editor.chain().focus().setTextSelection(range).unsetLink().run();
}

export function convertActiveLinkToBookmark(editor: Editor): boolean {
  const target = activeLinkTarget(editor);
  if (target?.kind !== "http" || !target.safeHref || !isSafeHttpUrl(target.safeHref)) return false;
  const range = linkMarkRangeAtSelection(editor);
  if (!range) return false;
  const type = editor.state.schema.nodes.bookmark;
  if (!type) return false;
  const selectedText = editor.state.doc.textBetween(range.from, range.to).trim();
  let host = target.safeHref;
  try {
    host = new URL(target.safeHref).hostname;
  } catch {
    /* keep href */
  }
  const title = selectedText && selectedText !== target.safeHref ? selectedText : host;
  const block = type.create({
    url: target.safeHref,
    title,
    description: "",
    image: "",
    favicon: "",
    style: "horizontal",
  });
  return replaceInlineRangeWithBlock(editor, range.from, range.to, block);
}

export function convertActiveLinkToEmbed(editor: Editor): boolean {
  const target = activeLinkTarget(editor);
  if (target?.kind !== "http" || !target.safeHref) return false;
  const embedUrl = rewriteEmbedUrl(target.safeHref);
  if (!isAllowedEmbedUrl(embedUrl)) return false;
  const range = linkMarkRangeAtSelection(editor);
  if (!range) return false;
  const type = editor.state.schema.nodes.embed;
  if (!type) return false;
  const block = type.create({ url: target.safeHref, embedUrl });
  return replaceInlineRangeWithBlock(editor, range.from, range.to, block);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function replaceSelectedAtom(editor: Editor, node: { nodeSize: number }): boolean {
  const { state } = editor;
  const { selection } = state;
  if (!(selection instanceof NodeSelection)) return false;
  const from = selection.from;
  const tr = state.tr
    .replaceWith(from, selection.to, node as never)
    .setMeta("preventAutolink", true)
    .scrollIntoView();
  tr.setSelection(NodeSelection.create(tr.doc, from));
  editor.view.dispatch(tr);
  return true;
}

export function convertSelectedCardToInline(editor: Editor): boolean {
  const card = selectedCard(editor);
  if (!card) return false;
  const label = card.title.trim() || hostnameOf(card.url) || card.url || "link";
  const { state } = editor;
  const marks = isSafeHttpUrl(card.url) ? [state.schema.marks.link.create({ href: card.url })] : [];
  const text = state.schema.text(label, marks);
  const paragraph = state.schema.nodes.paragraph.create(null, text);
  const tr = state.tr
    .replaceWith(card.from, card.to, paragraph)
    .setMeta("preventAutolink", true)
    .scrollIntoView();
  tr.setSelection(TextSelection.near(tr.doc.resolve(card.from + 2)));
  editor.view.dispatch(tr);
  return true;
}

export function convertSelectedCardToBookmark(editor: Editor): boolean {
  const card = selectedCard(editor);
  if (!card || card.kind === "bookmark") return false;
  if (!isSafeHttpUrl(card.url)) return false;
  const type = editor.state.schema.nodes.bookmark;
  if (!type) return false;
  const block = type.create({
    url: card.url,
    title: hostnameOf(card.url),
    description: "",
    image: "",
    favicon: "",
    style: "horizontal",
  });
  return replaceSelectedAtom(editor, block);
}

export function convertSelectedCardToEmbed(editor: Editor): boolean {
  const card = selectedCard(editor);
  if (!card || card.kind === "embed") return false;
  const embedUrl = rewriteEmbedUrl(card.url);
  if (!isAllowedEmbedUrl(embedUrl)) return false;
  const type = editor.state.schema.nodes.embed;
  if (!type) return false;
  return replaceSelectedAtom(editor, type.create({ url: card.url, embedUrl }));
}

export function deleteSelectedCard(editor: Editor): boolean {
  if (!selectedCard(editor)) return false;
  return editor.chain().focus().deleteSelection().run();
}

export function openSelectedCard(editor: Editor): boolean {
  const card = selectedCard(editor);
  if (!card) return false;
  return openLinkHref(card.url);
}

export function copySelectedCardUrl(editor: Editor): string | null {
  const card = selectedCard(editor);
  if (!card || !isSafeHttpUrl(card.url)) return null;
  return card.url;
}

export async function refreshSelectedBookmark(editor: Editor): Promise<boolean> {
  const card = selectedCard(editor);
  if (card?.kind !== "bookmark" || !isSafeHttpUrl(card.url)) return false;
  const meta = await fetchLinkPreview(card.url);
  if (!meta) return false;
  return updateBookmarkMeta(editor, card.url, meta);
}

export function toggleSelectedBookmarkListStyle(editor: Editor): boolean {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== "bookmark") return false;
  const next = selection.node.attrs.style === "list" ? "horizontal" : "list";
  return editor.chain().focus().updateAttributes("bookmark", { style: next }).run();
}

function pageRefAtSelection(editor: Editor): { from: number; to: number; pageId: string } | null {
  const { selection } = editor.state;
  if (selection instanceof NodeSelection && selection.node.type.name === PAGE_REF_NODE) {
    const pageId = String(selection.node.attrs.pageId ?? "").trim();
    if (!pageId) return null;
    return { from: selection.from, to: selection.to, pageId };
  }
  const { $from } = selection;
  const after = $from.nodeAfter;
  if (after?.type.name === PAGE_REF_NODE) {
    const pageId = String(after.attrs.pageId ?? "").trim();
    if (!pageId) return null;
    return { from: $from.pos, to: $from.pos + after.nodeSize, pageId };
  }
  const before = $from.nodeBefore;
  if (before?.type.name === PAGE_REF_NODE && editor.isActive(PAGE_REF_NODE)) {
    const pageId = String(before.attrs.pageId ?? "").trim();
    if (!pageId) return null;
    const from = $from.pos - before.nodeSize;
    return { from, to: $from.pos, pageId };
  }
  if (!editor.isActive(PAGE_REF_NODE)) return null;
  const pageId = String(editor.getAttributes(PAGE_REF_NODE).pageId ?? "").trim();
  if (!pageId) return null;
  return { from: selection.from, to: selection.to, pageId };
}

function pagesFromEditor(editor: Editor): Array<{ id: string; title: string }> {
  const ext = editor.extensionManager.extensions.find((item) => item.name === PAGE_REF_NODE);
  const getPages = (ext?.options as { getPages?: () => Array<{ id: string; title: string }> } | undefined)
    ?.getPages;
  return getPages?.() ?? [];
}

function unwrapPageRef(
  editor: Editor,
  page: { from: number; to: number; pageId: string },
): boolean {
  const title = displayTitleForPage(page.pageId, pagesFromEditor(editor)).title || "Untitled";
  const text = editor.state.schema.text(title);
  const tr = editor.state.tr.replaceWith(page.from, page.to, text).scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}

/** Extent of the link mark covering the caret, including adjacent same-href chunks. */
export function linkMarkRangeAtSelection(editor: Editor): { from: number; to: number } | null {
  const { state } = editor;
  const link = state.schema.marks.link;
  if (!link || !linkHrefNearSelection(editor)) return null;
  const { $from, from, empty } = state.selection;
  const parent = $from.parent;
  if (!parent.isTextblock) return null;
  const start = $from.start();
  let offset = 0;
  let index = -1;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const childFrom = start + offset;
    const childTo = childFrom + child.nodeSize;
    if (from > childFrom && from < childTo) {
      index = i;
      break;
    }
    if (from === childFrom && child.nodeSize > 0) {
      index = i;
      break;
    }
    if (empty && from === childTo && child.marks.some((mark) => mark.type === link)) {
      index = i;
      break;
    }
    offset += child.nodeSize;
  }
  if (index < 0) {
    // Caret on the far edge: last child that carries the mark.
    offset = 0;
    for (let i = 0; i < parent.childCount; i++) {
      const child = parent.child(i);
      if (child.marks.some((mark) => mark.type === link) && start + offset <= from && from <= start + offset + child.nodeSize) {
        index = i;
        break;
      }
      offset += child.nodeSize;
    }
  }
  if (index < 0) return null;
  const mark = parent.child(index).marks.find((item) => item.type === link);
  if (!mark) return null;

  let fromPos = start;
  offset = 0;
  for (let i = 0; i < index; i++) offset += parent.child(i).nodeSize;
  fromPos = start + offset;
  let toPos = fromPos + parent.child(index).nodeSize;

  for (let i = index - 1; i >= 0; i--) {
    const child = parent.child(i);
    if (!child.isText || !mark.isInSet(child.marks)) break;
    fromPos -= child.nodeSize;
  }
  for (let i = index + 1; i < parent.childCount; i++) {
    const child = parent.child(i);
    if (!child.isText || !mark.isInSet(child.marks)) break;
    toPos += child.nodeSize;
  }
  return { from: fromPos, to: toPos };
}

function replaceInlineRangeWithBlock(
  editor: Editor,
  from: number,
  to: number,
  block: { type: { name: string }; nodeSize: number },
): boolean {
  const { state } = editor;
  const $from = state.doc.resolve(from);
  if (!$from.parent.isTextblock) return false;
  const depth = $from.depth;
  const parent = $from.node(depth);
  const parentPos = $from.before(depth);
  const start = $from.start(depth);
  const before = parent.content.cut(0, from - start);
  const after = parent.content.cut(to - start);

  const nodes = [];
  if (before.size > 0) nodes.push(parent.type.create(parent.attrs, before));
  nodes.push(block as never);
  if (after.size > 0) nodes.push(parent.type.create(parent.attrs, after));
  const fragment = Fragment.fromArray(nodes as Parameters<typeof Fragment.fromArray>[0]);

  const $block = state.doc.resolve(parentPos);
  const container = $block.parent;
  const index = $block.index();
  if (!container.canReplace(index, index + 1, fragment)) {
    return insertBlockAfterUnlinking(editor, from, to, block);
  }

  const tr = state.tr
    .replaceWith(parentPos, parentPos + parent.nodeSize, fragment)
    .setMeta("preventAutolink", true)
    .scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}

function insertBlockAfterUnlinking(
  editor: Editor,
  from: number,
  to: number,
  block: { nodeSize: number },
): boolean {
  const link = editor.state.schema.marks.link;
  const top = getTopLevelBlockPos(editor.state.selection.$from as BlockPos);
  if (top == null || !link) return false;
  const topNode = editor.state.doc.nodeAt(top);
  if (!topNode) return false;
  const insertPos = top + topNode.nodeSize;
  const tr = editor.state.tr
    .removeMark(from, to, link)
    .insert(insertPos, block as never)
    .setMeta("preventAutolink", true)
    .scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}
