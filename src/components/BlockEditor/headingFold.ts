/** Duck-typed PM nodes — avoid importing Node (nested prosemirror-model copies). */
type FoldNode = {
  type: { name: string };
  nodeSize: number;
  attrs: { level?: number; collapsed?: boolean; id?: string | null };
  firstChild?: FoldNode | null;
};

type FoldParent = {
  childCount: number;
  child: (i: number) => FoldNode;
};

type FoldDoc = {
  nodeAt: (pos: number) => FoldNode | null;
  resolve: (pos: number) => { parent: FoldParent; index: () => number };
  descendants: (fn: (node: FoldNode, pos: number) => boolean | void) => void;
  content: { size: number };
};

export type FoldRange = { from: number; to: number };

/** Heading level of a node, or of an outline wrapper whose title is a heading. */
export function headingLevelOf(node: FoldNode | null | undefined): number | null {
  if (!node) return null;
  if (node.type.name === "heading") return Number(node.attrs.level ?? 1);
  if (node.type.name === "outlineBlock" && node.firstChild?.type.name === "heading") {
    return Number(node.firstChild.attrs.level ?? 1);
  }
  return null;
}

/**
 * Sibling range hidden when this heading is folded: from just after the heading
 * up to (not including) the next heading of the same or higher level.
 */
export function collapsedSiblings(doc: FoldDoc, headingPos: number): FoldRange | null {
  const heading = doc.nodeAt(headingPos);
  if (!heading || heading.type.name !== "heading") return null;
  const level = Number(heading.attrs.level ?? 1);
  const $before = doc.resolve(headingPos);
  const parent = $before.parent;
  const index = $before.index();
  let from = headingPos + heading.nodeSize;
  let to = from;
  for (let i = index + 1; i < parent.childCount; i++) {
    const child = parent.child(i);
    const childLevel = headingLevelOf(child);
    if (childLevel != null && childLevel <= level) break;
    to += child.nodeSize;
  }
  if (to <= from) return null;
  return { from, to };
}

export function findBlockPosById(doc: FoldDoc, id: string): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found != null) return false;
    if (node.attrs?.id === id) {
      found = pos;
      return false;
    }
  });
  return found;
}

export function findHeadingPosByIndex(doc: FoldDoc, index: number): number | null {
  let seen = 0;
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found != null) return false;
    if (node.type.name !== "heading") return;
    if (seen === index) {
      found = pos;
      return false;
    }
    seen += 1;
  });
  return found;
}

/** Headings whose folded sibling range contains `targetPos`. */
export function headingsHidingPos(doc: FoldDoc, targetPos: number): number[] {
  const hits: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading" || !node.attrs.collapsed) return;
    const range = collapsedSiblings(doc, pos);
    if (range && targetPos >= range.from && targetPos < range.to) hits.push(pos);
  });
  return hits;
}

export function expandFoldedHeadingsOverPos(editor: {
  state: { doc: FoldDoc; tr: any };
  view: { dispatch: (tr: any) => void };
}, targetPos: number): boolean {
  const headingPosList = headingsHidingPos(editor.state.doc, targetPos);
  if (!headingPosList.length) return false;
  const tr = editor.state.tr;
  for (const headingPos of headingPosList) {
    const node = tr.doc.nodeAt(headingPos);
    if (!node || node.type.name !== "heading") continue;
    tr.setNodeMarkup(headingPos, undefined, { ...node.attrs, collapsed: false });
  }
  editor.view.dispatch(tr);
  return true;
}

export function toggleHeadingCollapsedAt(editor: {
  state: { doc: FoldDoc; tr: any };
  view: { dispatch: (tr: any) => void };
}, headingPos: number): boolean {
  const node = editor.state.doc.nodeAt(headingPos);
  if (!node || node.type.name !== "heading") return false;
  const tr = editor.state.tr.setNodeMarkup(headingPos, undefined, {
    ...node.attrs,
    collapsed: !node.attrs.collapsed,
  });
  editor.view.dispatch(tr);
  return true;
}
