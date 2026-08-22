// Pure link extraction over TipTap JSON.
//
// Deliberately DOM-free so the same code runs on the main thread and inside the
// link indexer worker.

import type { JSONContent } from "@tiptap/core";

/** Href scheme every in-app page reference uses, in links and embeds alike. */
export const PAGE_HREF_PREFIX = "#page:";
/** `[[Title]]` typed by hand, or brought back by a markdown round-trip. */
const BARE_WIKILINK = /\[\[([^[\]|]+)(?:\|[^[\]]*)?\]\]/g;
/** `![[Title]]` embed syntax in raw markdown. */
const BARE_WIKIEMBED = /!\[\[([^[\]|]+)(?:\|[^[\]]*)?\]\]/g;
/** Obsidian-style hashtags in plain text (not inside words). */
const HASHTAG = /(?:^|[\s(])#([\w/-]+)/g;
/** `[Title](#page:id)` links and `![Title](#page:id)` embeds in raw markdown. */
const PAGE_LINK_MARKDOWN = new RegExp(`!?\\[[^\\]]*\\]\\(${PAGE_HREF_PREFIX}([^)\\s]+)\\)`, "g");

/** Longest snippet kept per link, enough for a line of context in the panel. */
const CONTEXT_MAX_LEN = 160;

export interface ExtractedLinks {
  /** Ids of pages this document links to, first occurrence first. */
  outgoing: string[];
  /** Wikilink titles that don't point at a page yet. */
  unresolved: string[];
  /** Lowercase-normalized hashtags found in the document. */
  tags: string[];
  /** Target page id to the sentence it was linked from, for backlink snippets. */
  contexts: Record<string, string>;
}

export function pageIdFromHref(href: string | null | undefined): string | null {
  if (!href?.startsWith(PAGE_HREF_PREFIX)) return null;
  const id = href.slice(PAGE_HREF_PREFIX.length).trim();
  return id || null;
}

function collectHashtags(text: string, tags: Set<string>): void {
  for (const match of text.matchAll(HASHTAG)) {
    const tag = match[1]?.trim().toLowerCase();
    if (tag) tags.add(tag);
  }
}

/** Parse `tags:` / `tag:` lines from YAML frontmatter in markdown. */
export function extractTagsFromFrontmatter(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return [];
  const tags = new Set<string>();
  const head = match[1];
  const listMatch = head.match(/^tags:\s*\[(.+)\]\s*$/im);
  if (listMatch) {
    for (const part of listMatch[1].split(",")) {
      const tag = part.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
      if (tag) tags.add(tag);
    }
  }
  const inlineMatch = head.match(/^tags:\s*(.+)\s*$/im);
  if (inlineMatch && !listMatch) {
    for (const part of inlineMatch[1].split(",")) {
      const tag = part.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
      if (tag) tags.add(tag);
    }
  }
  const singleMatch = head.match(/^tag:\s*(.+)\s*$/im);
  if (singleMatch) {
    const tag = singleMatch[1].trim().replace(/^['"]|['"]$/g, "").toLowerCase();
    if (tag) tags.add(tag);
  }
  return Array.from(tags);
}

export function extractTags(
  doc: JSONContent | null | undefined,
  markdown?: string | null,
): string[] {
  const tags = new Set<string>(extractTagsFromFrontmatter(markdown));
  const visit = (node: JSONContent) => {
    if (typeof node.text === "string") collectHashtags(node.text, tags);
    for (const child of node.content ?? []) visit(child);
  };
  if (doc) visit(doc);
  return Array.from(tags).sort();
}

/** Node types whose text reads as one sentence of context around a link. */
const CONTEXT_BLOCKS = new Set(["paragraph", "heading", "listItem", "taskItem", "callout"]);

function plainText(node: JSONContent): string {
  if (typeof node.text === "string") return node.text;
  if (node.type === "pageRef") return "";
  return (node.content ?? []).map(plainText).join("");
}

function toSnippet(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= CONTEXT_MAX_LEN) return clean;
  return `${clean.slice(0, CONTEXT_MAX_LEN).trimEnd()}…`;
}

/**
 * The markdown line `index` falls on — where the link was written — reduced to
 * the words a reader would see rather than the source syntax.
 */
function lineAt(markdown: string, index: number): string {
  const start = markdown.lastIndexOf("\n", index) + 1;
  const end = markdown.indexOf("\n", index);
  return markdown
    .slice(start, end === -1 ? undefined : end)
    .replace(/^\s*(?:[#>*-]+|\d+\.)\s*/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "");
}

export function extractLinks(
  doc: JSONContent | null | undefined,
  markdown?: string | null,
): ExtractedLinks {
  const outgoing = new Set<string>();
  const unresolved = new Set<string>();
  const contexts: Record<string, string> = {};

  // First mention wins: it is the one the reader scrolls to.
  const addContext = (id: string, text: string) => {
    if (contexts[id]) return;
    const snippet = toSnippet(text);
    if (snippet) contexts[id] = snippet;
  };

  const visit = (node: JSONContent, block: JSONContent | null) => {
    const enclosing = node.type != null && CONTEXT_BLOCKS.has(node.type) ? node : block;
    if (node.type === "pageEmbed" || node.type === "pageRef") {
      const pageId = node.attrs?.pageId as string | undefined;
      if (pageId) {
        outgoing.add(pageId);
        if (enclosing) addContext(pageId, plainText(enclosing));
      }
    }
    for (const mark of node.marks ?? []) {
      if (mark.type !== "link") continue;
      const id = pageIdFromHref(mark.attrs?.href as string | undefined);
      if (!id) continue;
      outgoing.add(id);
      if (enclosing) addContext(id, plainText(enclosing));
    }
    if (typeof node.text === "string") {
      if (node.text.includes("[[")) {
        for (const match of node.text.matchAll(BARE_WIKILINK)) {
          const title = match[1].trim();
          if (title) unresolved.add(title);
        }
      }
      if (node.text.includes("![[")) {
        for (const match of node.text.matchAll(BARE_WIKIEMBED)) {
          const title = match[1].trim();
          if (title) unresolved.add(title);
        }
      }
    }
    for (const child of node.content ?? []) visit(child, enclosing);
  };

  if (doc) visit(doc, null);
  if (markdown) {
    // Pages that were never opened in this browser have markdown but no saved
    // TipTap JSON, so the markdown is the only place their links show up.
    for (const match of markdown.matchAll(PAGE_LINK_MARKDOWN)) {
      const id = match[1].trim();
      if (!id) continue;
      outgoing.add(id);
      addContext(id, lineAt(markdown, match.index));
    }
    for (const match of markdown.matchAll(BARE_WIKIEMBED)) {
      const title = match[1].trim();
      if (title) unresolved.add(title);
    }
  }
  return {
    outgoing: Array.from(outgoing),
    unresolved: Array.from(unresolved),
    tags: extractTags(doc, markdown),
    contexts,
  };
}
