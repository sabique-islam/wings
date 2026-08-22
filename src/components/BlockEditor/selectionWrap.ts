export const WRAP_PAIRS: Record<string, [string, string]> = {
  "(": ["(", ")"],
  "[": ["[", "]"],
  "{": ["{", "}"],
  '"': ['"', '"'],
  "'": ["'", "'"],
  "`": ["`", "`"],
};

const CLOSERS = new Set(Object.values(WRAP_PAIRS).map(([, close]) => close));

/** True when the characters touching a selection are already `[` and `]`. */
export function isBracketWrapped(before: string, after: string): boolean {
  return before === "[" && after === "]";
}

/** After inserting a pair around `from..to`, the inner range. */
export function innerRangeAfterWrap(from: number, to: number): { from: number; to: number } {
  return { from: from + 1, to: to + 1 };
}

/** In a code block, typing the closer that already sits ahead of the caret skips it. */
export function shouldSkipCodeCloser(typed: string, nextChar: string): boolean {
  return CLOSERS.has(typed) && typed === nextChar;
}

export function pageIdForTitle(
  title: string,
  pages: ReadonlyArray<{ id: string; title: string }>,
): string | null {
  const wanted = title.trim().toLowerCase();
  if (!wanted) return null;
  const page = pages.find((entry) => entry.title.trim().toLowerCase() === wanted);
  return page?.id ?? null;
}
