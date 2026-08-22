import { fuzzyMatch } from "./blockCommands";
import type { PageSuggestion } from "./PageSuggestionList";

const MAX_SUGGESTIONS = 12;

/** Ranked page matches for the `@` mention and `[[` wikilink pickers. */
export function matchPages(pages: PageSuggestion[], query: string): PageSuggestion[] {
  const trimmed = query.trim();
  if (!trimmed) return pages.slice(0, MAX_SUGGESTIONS);
  return pages
    .map((page) => ({ page, score: fuzzyMatch(trimmed, page.title || "Untitled") }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ page }) => page)
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * A wikilink query stops at the closing brackets. TipTap's suggestion match runs
 * to the end of the line, so `[[Ideas]] more text` would otherwise search for
 * `Ideas]] more text`.
 */
export function wikiLinkQuery(raw: string): string {
  const closed = raw.search(/\]\]|】】/);
  return (closed === -1 ? raw : raw.slice(0, closed)).trim();
}
