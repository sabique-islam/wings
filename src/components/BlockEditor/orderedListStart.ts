/**
 * Numbered-list start from a typed `3.` marker.
 *
 * TipTap stores one `<ol start>` wrapping items, not per-item order.
 * Joining the previous list is how numbering stays continuous.
 */

export function parseOrderedListMarker(text: string): number | null {
  const match = text.trim().match(/^(\d+)\.$/);
  if (!match) return null;
  const order = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isInteger(order) || order < 1) return null;
  return order;
}

export function resolveOrderedListStart(
  typedOrder: number,
  previous: { start: number; itemCount: number } | null,
): { start: number; join: boolean } {
  const order = Number.isInteger(typedOrder) && typedOrder > 0 ? typedOrder : 1;
  if (!previous) return { start: order, join: false };
  const continued = previous.start + previous.itemCount;
  if (continued === order) return { start: continued, join: true };
  return { start: order, join: false };
}
