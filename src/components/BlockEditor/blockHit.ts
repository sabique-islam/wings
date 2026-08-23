import type { EditorView } from "@tiptap/pm/view";
import { getTopLevelBlockPos, type BlockPos } from "./blockUtils";

/**
 * ResolvedPos-shaped input for coordinate hit-testing.
 * Avoids importing ResolvedPos from nested prosemirror-model copies.
 */
export interface CoordPos extends BlockPos {
  pos: number;
  nodeAfter: { isBlock: boolean; nodeSize: number } | null;
  nodeBefore: { isBlock: boolean; nodeSize: number } | null;
}

export interface CoordDoc {
  resolve(pos: number): CoordPos;
  nodeAt(pos: number): { isBlock: boolean; nodeSize: number } | null;
}

export interface CoordInfo {
  pos: number;
  inside: number;
}

/**
 * Top-level block under a `posAtCoords` result.
 *
 * Text blocks report `inside >= 0` and resolve through `getTopLevelBlockPos`.
 * Atoms (math, drawings, bookmarks) sit in a document-level gap (`inside: -1`,
 * depth 0), so we take the adjacent child instead of returning null.
 */
export function topLevelBlockPosFromResolved($pos: CoordPos): number | null {
  const nested = getTopLevelBlockPos($pos);
  if (nested != null) return nested;
  if ($pos.depth !== 0) return null;
  if ($pos.nodeAfter) return $pos.pos;
  if ($pos.nodeBefore) return $pos.pos - $pos.nodeBefore.nodeSize;
  return null;
}

export function topLevelBlockPosFromCoordInfo(doc: CoordDoc, posInfo: CoordInfo): number | null {
  if (posInfo.inside >= 0) {
    const fromInside = topLevelBlockPosFromResolved(doc.resolve(posInfo.inside));
    if (fromInside != null) return fromInside;
  }
  return topLevelBlockPosFromResolved(doc.resolve(posInfo.pos));
}

export function topLevelBlockPosAtCoords(
  view: EditorView,
  clientX: number,
  clientY: number,
): number | null {
  const posInfo = view.posAtCoords({ left: clientX, top: clientY });
  if (!posInfo) return null;
  return topLevelBlockPosFromCoordInfo(view.state.doc as unknown as CoordDoc, posInfo);
}
