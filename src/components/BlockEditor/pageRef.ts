import { PAGE_HREF_PREFIX, pageIdFromHref } from "@/lib/linkExtraction";

export const PAGE_REF_NODE = "pageRef";

export function displayTitleForPage(
  pageId: string,
  pages: ReadonlyArray<{ id: string; title: string }>,
): { title: string; missing: boolean } {
  const page = pages.find((entry) => entry.id === pageId);
  if (!page) return { title: "Untitled", missing: true };
  const title = page.title.trim();
  return { title: title || "Untitled", missing: false };
}

export function pageRefHref(pageId: string): string {
  return `${PAGE_HREF_PREFIX}${pageId}`;
}

export function pageRefNodeJSON(pageId: string) {
  return { type: PAGE_REF_NODE, attrs: { pageId } };
}

export function insertPageRefAtRange(
  editor: { chain: () => any },
  range: { from: number; to: number },
  pageId: string,
): void {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent(pageRefNodeJSON(pageId))
    .insertContent(" ")
    .run();
}

type LinkMarkLike = {
  type: { name: string };
  attrs: { href?: unknown };
};

type TextNodeLike = {
  isText?: boolean;
  nodeSize: number;
  marks: readonly LinkMarkLike[];
};

export interface PageLinkMarkRange {
  from: number;
  to: number;
  pageId: string;
}

/** Positions of frozen `#page:` link marks that should become live page refs. */
export function pageLinkMarkRanges(doc: {
  descendants: (fn: (node: TextNodeLike, pos: number) => void) => void;
}): PageLinkMarkRange[] {
  const ranges: PageLinkMarkRange[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((item) => item.type.name === "link");
    if (!mark) return;
    const pageId = pageIdFromHref(typeof mark.attrs.href === "string" ? mark.attrs.href : null);
    if (!pageId) return;
    ranges.push({ from: pos, to: pos + node.nodeSize, pageId });
  });
  return ranges;
}

/**
 * Replace `#page:` link marks with pageRef atoms.
 *
 * Display titles live in the page list, not in the document, so a rename must
 * not rewrite every mention. Old saves still store a frozen link mark; lifting
 * them once keeps the id and drops the stale label.
 */
export function liftPageLinkMarks(state: {
  doc: Parameters<typeof pageLinkMarkRanges>[0];
  tr: {
    replaceWith: (from: number, to: number, node: unknown) => unknown;
    setMeta: (key: string, value: unknown) => unknown;
  };
  schema: { nodes: Record<string, { create: (attrs: { pageId: string }) => unknown } | undefined> };
}): unknown | null {
  const ranges = pageLinkMarkRanges(state.doc);
  if (ranges.length === 0) return null;
  const type = state.schema.nodes[PAGE_REF_NODE];
  if (!type) return null;
  const tr = state.tr;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i]!;
    tr.replaceWith(range.from, range.to, type.create({ pageId: range.pageId }));
  }
  tr.setMeta("addToHistory", false);
  return tr;
}
