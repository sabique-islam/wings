/** Relative column weights. Missing or mismatched values become equal `1`s. */
export function parseColumnWidths(raw: unknown, count: number): number[] {
  const n = Math.max(1, count);
  const fallback = Array.from({ length: n }, () => 1);
  const parts = typeof raw === "string"
    ? raw.split(",").map((part) => Number(part.trim()))
    : Array.isArray(raw)
      ? raw.map((part) => Number(part))
      : null;
  if (!parts || parts.length !== n) return fallback;
  if (!parts.every((value) => Number.isFinite(value) && value > 0)) return fallback;
  return parts;
}

export function columnTemplateCss(widths: number[]): string {
  return widths.map((weight) => `${weight}fr`).join(" ");
}

export function serializeColumnWidths(widths: number[]): string {
  return widths.map((weight) => String(Math.round(weight * 1000) / 1000)).join(",");
}

/** Shift weight from `index + 1` onto `index` by `delta` (same units as widths). */
export function resizeColumnPair(widths: number[], index: number, delta: number, min = 0.18): number[] {
  if (index < 0 || index >= widths.length - 1) return widths;
  const left = widths[index]!;
  const right = widths[index + 1]!;
  let nextLeft = left + delta;
  let nextRight = right - delta;
  if (nextLeft < min) {
    nextRight -= min - nextLeft;
    nextLeft = min;
  }
  if (nextRight < min) {
    nextLeft -= min - nextRight;
    nextRight = min;
  }
  if (nextLeft < min || nextRight < min) return widths;
  const next = widths.slice();
  next[index] = nextLeft;
  next[index + 1] = nextRight;
  return next;
}
