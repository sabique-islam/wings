import type { Editor } from "@tiptap/core";
import { TextSelection, NodeSelection } from "@tiptap/pm/state";
import { blockSelectionKey, EMPTY_BLOCK_SELECTION } from "./blockSelectionKey";

/**
 * Structural types for position/doc helpers.
 * Avoids importing ResolvedPos/Node from @tiptap/pm/model — nested copies of
 * prosemirror-model under prosemirror-state cause incompatible TS identities.
 */
export interface BlockPos {
  depth: number;
  before(depth: number): number;
  index(depth: number): number;
  node(depth: number): { type: { name: string }; nodeSize?: number };
}

export interface BlockDoc {
  forEach(fn: (node: { nodeSize: number; copy(content: unknown): unknown }, offset: number) => void): void;
  nodeAt(pos: number): { isBlock: boolean; nodeSize: number; copy(content: unknown): unknown } | null;
  content: { size: number };
  resolve(pos: number): BlockPos;
}

/** True when the caret or selection sits inside a code block. */
export function isSelectionInCodeBlock($from: BlockPos): boolean {
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "codeBlock") return true;
  }
  return false;
}

/** Depth of the block that is a direct child of the document. */
export function findTopLevelDepth($from: BlockPos): number {
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth - 1).type.name !== "doc") depth--;
  return depth;
}

/** Depth of the enclosing column, when the caret is inside one. */
export function findColumnDepth($from: BlockPos): number | null {
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "column") return depth;
  }
  return null;
}

/** Depth of the enclosing week card, when the caret is inside one. */
export function findWeekCardDepth($from: BlockPos): number | null {
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "weekCard") return depth;
  }
  return null;
}

type CoverableNode = {
  isTextblock: boolean;
  nodeSize: number;
  descendants: (fn: (child: { isTextblock: boolean; nodeSize: number }, childPos: number) => void) => void;
};

/** Text selection over a block. Outer node positions are not valid TextSelection anchors. */
export function selectionCoveringNode(doc: { resolve: (pos: number) => unknown }, pos: number, node: CoverableNode) {
  if (node.isTextblock) {
    return TextSelection.create(doc as never, pos + 1, Math.max(pos + 1, pos + node.nodeSize - 1));
  }
  let from: number | null = null;
  let to: number | null = null;
  node.descendants((child, childPos) => {
    if (!child.isTextblock) return;
    const start = pos + 1 + childPos + 1;
    const end = pos + 1 + childPos + child.nodeSize - 1;
    if (from == null) from = start;
    to = end;
  });
  if (from == null || to == null) return NodeSelection.create(doc as never, pos);
  return TextSelection.create(doc as never, from, to);
}

export function getTopLevelBlockPos($from: BlockPos): number | null {
  const depth = findTopLevelDepth($from);
  if (depth < 1) return null;
  return $from.before(depth);
}

export function getTopLevelBlockIndex($from: BlockPos): number {
  const depth = findTopLevelDepth($from);
  return depth >= 1 ? $from.index(depth - 1) : -1;
}

/**
 * Where the caret should land after deleting an empty block that sat after
 * the node at `prevPos`. Textblocks end at `pos + 1 + content.size`; atoms
 * land just after the node.
 */
export function caretPosAfterMerge(
  prevPos: number,
  prev: { isTextblock: boolean; content: { size: number }; nodeSize: number },
  docSize: number,
): number {
  const pos = prev.isTextblock ? prevPos + 1 + prev.content.size : prevPos + prev.nodeSize;
  return Math.max(0, Math.min(pos, docSize));
}

/** All direct-child block positions in the document. */
export function getDocChildBlockPositions(doc: BlockDoc): number[] {
  const positions: number[] = [];
  doc.forEach((_node, offset) => {
    positions.push(offset);
  });
  return positions;
}

/** Inclusive top-level range from one child block to another. */
export function rangeSelect(anchor: number, target: number, doc: BlockDoc): number[] {
  const all = getDocChildBlockPositions(doc);
  const ai = all.indexOf(anchor);
  const ti = all.indexOf(target);
  if (ai < 0 || ti < 0) return [target];
  const [from, to] = ai < ti ? [ai, ti] : [ti, ai];
  return all.slice(from, to + 1);
}

/**
 * Shift+click grows from the existing block-selection anchor, then the caret's
 * block, then the clicked block (so the first Shift+click is never a no-op).
 */
export function resolveShiftClickAnchor(
  pluginAnchor: number | null,
  caretBlockPos: number | null,
  clickedPos: number,
): number {
  if (pluginAnchor != null) return pluginAnchor;
  if (caretBlockPos != null) return caretBlockPos;
  return clickedPos;
}

export function toggleBlockInSelection(
  positions: number[],
  anchor: number | null,
  clickedPos: number,
): { positions: number[]; anchor: number } {
  const exists = positions.includes(clickedPos);
  const next = exists ? positions.filter((p) => p !== clickedPos) : [...positions, clickedPos];
  return { positions: next, anchor: anchor ?? clickedPos };
}

export function shouldPromoteToBlockRange(startPos: number, currentPos: number): boolean {
  return startPos !== currentPos;
}

/** How far left of the text column counts as the gutter. */
export const MARGIN_DRAG_ZONE_PX = 64;

export function isInMarginDragZone(offsetFromLeft: number, zonePx = MARGIN_DRAG_ZONE_PX): boolean {
  return offsetFromLeft <= 0 && offsetFromLeft >= -zonePx;
}

/** Slice covering every selected top-level block, in document order. */
export function coveringRangeForPositions(
  doc: { nodeAt(pos: number): { nodeSize: number } | null },
  positions: number[],
): { from: number; to: number } | null {
  if (positions.length === 0) return null;
  const sorted = [...positions].sort((a, b) => a - b);
  const last = sorted[sorted.length - 1]!;
  const node = doc.nodeAt(last);
  if (!node) return null;
  return { from: sorted[0]!, to: last + node.nodeSize };
}

export interface BlockSelectionRange {
  positions: number[];
  anchor: number;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

/**
 * Move or grow a block selection by one block, Notion-style.
 *
 * `extend` keeps the anchor put and walks the far end of the range, which makes
 * Shift+Arrow shrink the selection when it is travelling back toward the anchor.
 * Returns null when there is nothing selected, so the caller can fall through to
 * ordinary caret movement.
 */
export function stepBlockSelection(
  doc: BlockDoc,
  positions: number[],
  anchor: number | null,
  direction: -1 | 1,
  extend: boolean,
): BlockSelectionRange | null {
  const all = getDocChildBlockPositions(doc);
  const indices = positions
    .map((pos) => all.indexOf(pos))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  if (indices.length === 0) return null;

  const last = all.length - 1;
  const anchorIndex =
    anchor != null && all.indexOf(anchor) >= 0 ? all.indexOf(anchor) : indices[0]!;

  if (!extend) {
    const from = direction > 0 ? indices[indices.length - 1]! : indices[0]!;
    const next = clamp(from + direction, last);
    return { positions: [all[next]!], anchor: all[next]! };
  }

  const head = indices.reduce(
    (furthest, index) =>
      Math.abs(index - anchorIndex) > Math.abs(furthest - anchorIndex) ? index : furthest,
    indices[0]!,
  );
  const nextHead = clamp(head + direction, last);
  const [from, to] = anchorIndex <= nextHead ? [anchorIndex, nextHead] : [nextHead, anchorIndex];
  return { positions: all.slice(from, to + 1), anchor: all[anchorIndex]! };
}

/** Position of the block containing the caret, or null. Does not change selection. */
export function selectCurrentBlock(editor: Editor): number | null {
  return getTopLevelBlockPos(editor.state.selection.$from as BlockPos);
}

export function deleteBlocksAtPositions(editor: Editor, positions: number[]): boolean {
  if (!positions.length) return false;
  const sorted = [...positions].sort((a, b) => b - a);
  let tr = editor.state.tr;
  for (const pos of sorted) {
    const node = tr.doc.nodeAt(pos);
    if (!node) continue;
    tr = tr.delete(pos, pos + node.nodeSize);
  }
  const mapped = Math.min(sorted[sorted.length - 1]!, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(1, mapped))));
  tr.setMeta(blockSelectionKey, EMPTY_BLOCK_SELECTION);
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function duplicateBlocksAtPositions(editor: Editor, positions: number[]): boolean {
  if (!positions.length) return false;
  const sorted = [...positions].sort((a, b) => a - b);
  let tr = editor.state.tr;
  let insertOffset = 0;
  for (const pos of sorted) {
    const mapped = tr.mapping.map(pos + insertOffset);
    const node = tr.doc.nodeAt(mapped);
    if (!node) continue;
    tr = tr.insert(mapped + node.nodeSize, node.copy(node.content));
    insertOffset += node.nodeSize;
  }
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}
