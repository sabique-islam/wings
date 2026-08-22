import { shouldBlockEmptySave } from "@/lib/editorContent";
import { PAGE_REF_NODE } from "./pageRef";

export interface FindMatch {
  from: number;
  to: number;
  /** Live page chips expose a title but that text is not in the document. */
  replaceable: boolean;
}

export interface FindReplaceState {
  open: boolean;
  query: string;
  caseSensitive: boolean;
  matches: FindMatch[];
  active: number;
  selectionOnOpen: { from: number; to: number } | null;
  focusNonce: number;
}

export const EMPTY_FIND_STATE: FindReplaceState = {
  open: false,
  query: "",
  caseSensitive: false,
  matches: [],
  active: -1,
  selectionOnOpen: null,
  focusNonce: 0,
};

export function findRangesInText(
  text: string,
  query: string,
  caseSensitive: boolean,
): Array<{ start: number; end: number }> {
  if (!query) return [];
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  if (!needle) return [];
  const ranges: Array<{ start: number; end: number }> = [];
  let from = 0;
  while (from <= hay.length - needle.length) {
    const index = hay.indexOf(needle, from);
    if (index < 0) break;
    ranges.push({ start: index, end: index + needle.length });
    from = index + needle.length;
  }
  return ranges;
}

function textIncludes(haystack: string, needle: string, caseSensitive: boolean): boolean {
  if (!needle) return false;
  if (caseSensitive) return haystack.includes(needle);
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

type FindDoc = {
  descendants: (
    fn: (
      node: {
        isText?: boolean;
        text?: string | null;
        nodeSize: number;
        type: { name: string };
        attrs?: { pageId?: unknown };
      },
      pos: number,
    ) => void,
  ) => void;
};

export function collectFindMatches(
  doc: FindDoc,
  query: string,
  options: {
    caseSensitive: boolean;
    pageTitle: (pageId: string) => string;
  },
): FindMatch[] {
  if (!query) return [];
  const matches: FindMatch[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (const range of findRangesInText(node.text, query, options.caseSensitive)) {
        matches.push({
          from: pos + range.start,
          to: pos + range.end,
          replaceable: true,
        });
      }
      return;
    }
    if (node.type.name !== PAGE_REF_NODE) return;
    const pageId = typeof node.attrs?.pageId === "string" ? node.attrs.pageId : "";
    const title = options.pageTitle(pageId);
    if (!textIncludes(title, query, options.caseSensitive)) return;
    matches.push({ from: pos, to: pos + node.nodeSize, replaceable: false });
  });
  return matches;
}

export function collectSearchableText(doc: FindDoc): string {
  let text = "";
  doc.descendants((node) => {
    if (node.isText && node.text) text += node.text;
  });
  return text;
}

export function replaceAllInString(
  text: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
): string {
  const ranges = findRangesInText(text, query, caseSensitive);
  if (ranges.length === 0) return text;
  let out = "";
  let last = 0;
  for (const range of ranges) {
    out += text.slice(last, range.start) + replacement;
    last = range.end;
  }
  return out + text.slice(last);
}

/** Same ≥20-char empty-save rule, applied before replace-all mutates the doc. */
export function wouldEmptyReplaceAll(
  doc: FindDoc,
  query: string,
  replacement: string,
  caseSensitive: boolean,
): boolean {
  const existing = collectSearchableText(doc);
  const next = replaceAllInString(existing, query, replacement, caseSensitive);
  return shouldBlockEmptySave(existing, next);
}

export function stepMatchIndex(count: number, active: number, delta: number): number {
  if (count === 0) return -1;
  if (active < 0) return delta >= 0 ? 0 : count - 1;
  return (active + delta + count) % count;
}

export function clampActive(count: number, active: number): number {
  if (count === 0) return -1;
  if (active < 0) return 0;
  if (active >= count) return count - 1;
  return active;
}

export function refreshFindState(
  state: FindReplaceState,
  doc: FindDoc,
  pageTitle: (pageId: string) => string,
): FindReplaceState {
  if (!state.open) {
    return { ...state, matches: [], active: -1 };
  }
  const matches = collectFindMatches(doc, state.query, {
    caseSensitive: state.caseSensitive,
    pageTitle,
  });
  return { ...state, matches, active: clampActive(matches.length, state.active) };
}
