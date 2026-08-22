/**
 * Drag-drop placement: the right half of a block nests, otherwise
 * the pointer's Y vs the block midpoint is before/after.
 *
 * Tab already nests any text block, so the right-half zone applies to
 * every block, not only lists.
 */

export type DropPlacement = "before" | "after" | "nest";

export function dropPlacement(
  rect: { left: number; width: number; top: number; height: number },
  point: { x: number; y: number },
): DropPlacement {
  if (rect.width <= 0) return point.y < rect.top + rect.height / 2 ? "before" : "after";
  if (point.x >= rect.left + rect.width / 2) return "nest";
  const mid = rect.top + rect.height / 2;
  return point.y < mid ? "before" : "after";
}
