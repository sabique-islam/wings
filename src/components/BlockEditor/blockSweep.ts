import type { EditorView } from "@tiptap/pm/view";

export type SweepRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SweepBlock = {
  pos: number;
  parentPos: number | null;
  isWrapper: boolean;
  rect: SweepRect;
};

const WRAPPER_TYPES = new Set([
  "bulletList",
  "orderedList",
  "taskList",
  "outlineBlock",
  "columnList",
  "column",
]);

export function sweepRectFromPoints(ax: number, ay: number, bx: number, by: number): SweepRect {
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

export function rectIntersects(a: SweepRect, b: SweepRect): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

/** True when `outer` covers `inner`'s top and bottom. */
export function rectIncludesVertically(outer: SweepRect, inner: SweepRect): boolean {
  return outer.top <= inner.top && outer.top + outer.height >= inner.top + inner.height;
}

export function pointInRect(x: number, y: number, rect: SweepRect): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

/**
 * Blocks whose rects intersect the pointer sweep.
 * Direction does not matter: the sweep rect is min/max of the two corners.
 * If the sweep sits entirely inside one wrapper, intersecting children of that
 * wrapper win. A child is dropped when its parent is already selected.
 */
export function blocksInSweep(blocks: SweepBlock[], userRect: SweepRect): number[] {
  const ySorted = [...blocks].sort((a, b) => a.rect.top - b.rect.top);
  const candidates: SweepBlock[] = [];
  for (const block of ySorted) {
    if (userRect.top + userRect.height < block.rect.top) break;
    candidates.push(block);
  }

  const intersecting = candidates.filter((block) => rectIntersects(userRect, block.rect));
  if (intersecting.length === 0) return [];

  const containingWrapper = intersecting.find(
    (block) => block.isWrapper && rectIncludesVertically(block.rect, userRect),
  );
  const picked =
    containingWrapper != null
      ? (() => {
          const children = intersecting.filter((block) => block.parentPos === containingWrapper.pos);
          return children.length > 0 ? children : [containingWrapper];
        })()
      : intersecting;

  const posSet = new Set(picked.map((block) => block.pos));
  return picked
    .filter((block) => block.parentPos == null || !posSet.has(block.parentPos))
    .map((block) => block.pos)
    .sort((a, b) => a - b);
}

function elementAtPos(view: EditorView, pos: number): HTMLElement | null {
  let dom = view.nodeDOM(pos);
  if (dom && dom.nodeType !== 1) dom = (dom as Node).parentElement;
  return dom instanceof HTMLElement ? dom : null;
}

function clientRect(el: HTMLElement): SweepRect {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * Top-level blocks plus one or two levels of list / outline / column children,
 * each with a live DOM rect.
 */
export function listSelectableBlockRects(view: EditorView): SweepBlock[] {
  const result: SweepBlock[] = [];

  const visit = (
    node: { type: { name: string }; forEach: (fn: (child: typeof node, offset: number) => void) => void },
    pos: number,
    parentPos: number | null,
    depth: number,
  ) => {
    const el = elementAtPos(view, pos);
    if (!el) return;
    const isWrapper = WRAPPER_TYPES.has(node.type.name);
    result.push({ pos, parentPos, isWrapper, rect: clientRect(el) });
    if (!isWrapper || depth >= 2) return;
    node.forEach((child, childOffset) => {
      visit(child, pos + 1 + childOffset, pos, depth + 1);
    });
  };

  view.state.doc.forEach((node, offset) => {
    visit(node, offset, null, 0);
  });
  return result;
}
