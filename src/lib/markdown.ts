// Markdown <-> HTML conversion used by the block editor.

import { marked } from "marked";
import TurndownService from "turndown";
import { PAGE_HREF_PREFIX } from "./linkExtraction";
import { normalizeMathMarkdown } from "./normalizeMath";

/** Blocks the editor stores as HTML or bespoke syntax because markdown has none. */
const CUSTOM_BLOCK_TYPES = new Set([
  "callout",
  "toggle",
  "column-list",
  "bookmark",
  "embed",
  "page-embed",
  "excalidraw",
  "block-math",
  "inline-math",
  "database",
  "synced-block",
  "paragraph",
  "heading",
]);

/** Markdown for one custom block, or null when the node is an ordinary element. */
function customBlockMarkdown(el: HTMLElement): string | null {
  const type = el.getAttribute("data-type");
  if (!type || !CUSTOM_BLOCK_TYPES.has(type)) return null;
  if (type === "inline-math") return `$${el.getAttribute("data-latex") || ""}$`;
  if (type === "block-math") return `\n\n$$\n${el.getAttribute("data-latex") || ""}\n$$\n\n`;
  if (type === "page-embed") {
    const title = el.getAttribute("data-title") || el.getAttribute("data-page-title") || "Untitled";
    const pageId = el.getAttribute("data-page-id");
    // Titles are not unique, so only the id lets a reload rebuild the embed and
    // keep its edge in the link graph.
    if (!pageId) return `\n\n![[${title}]]\n\n`;
    return `\n\n![${title}](${PAGE_HREF_PREFIX}${pageId})\n\n`;
  }
  return `\n\n${el.outerHTML}\n\n`;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "_",
  // Formulas, bookmarks and page embeds keep all their state in attributes, so
  // turndown sees empty elements and discards them before any rule runs. Every
  // one of those blocks used to vanish from a page's markdown on save.
  blankReplacement: (content, node) => {
    const custom = node.nodeType === 1 ? customBlockMarkdown(node as HTMLElement) : null;
    if (custom !== null) return custom;
    // A wrapper holding only attribute-only blocks looks blank too, so keep what
    // its children produced rather than dropping the whole subtree.
    if (content.trim()) return content;
    return (node as unknown as { isBlock?: boolean }).isBlock ? "\n\n" : "";
  },
});

turndown.addRule("taskList", {
  filter: (node) =>
    node.nodeName === "LI" &&
    (node as HTMLElement).getAttribute("data-type") === "taskItem",
  replacement(_content, node) {
    const checked = (node as HTMLElement).getAttribute("data-checked") === "true";
    const text = (node as HTMLElement).innerText.trim();
    return `- [${checked ? "x" : " "}] ${text}\n`;
  },
});

turndown.addRule("highlight", {
  filter: ["mark"],
  replacement: (content) => `==${content}==`,
});

turndown.addRule("underline", {
  filter: ["u"],
  replacement: (content) => `<u>${content}</u>`,
});

// Preserve inline styles for color/align
turndown.addRule("styledSpan", {
  filter: (node) => {
    if (node.nodeName !== "SPAN") return false;
    const el = node as HTMLElement;
    return !!(el.getAttribute("style") || el.style.color);
  },
  replacement: (content, node) => (node as HTMLElement).outerHTML.replace(content, content),
});

// Added last so it outranks `styledSpan` for custom nodes that carry a style.
turndown.addRule("collapsedHeading", {
  filter: (node) =>
    /^H[1-3]$/.test(node.nodeName) && (node as HTMLElement).getAttribute("data-collapsed") === "true",
  replacement: (_content, node) => `\n\n${(node as HTMLElement).outerHTML}\n\n`,
});

turndown.addRule("customBlock", {
  filter: (node) =>
    node.nodeType === 1 &&
    CUSTOM_BLOCK_TYPES.has((node as HTMLElement).getAttribute("data-type") ?? ""),
  replacement: (_content, node) => customBlockMarkdown(node as HTMLElement) ?? "",
});

export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  const input = html.trim().startsWith("<") ? `<div data-root="1">${html}</div>` : html;
  return turndown.turndown(input).trim();
}

marked.setOptions({ gfm: true, breaks: false });

/**
 * Blocks the editor cannot express in markdown, so `htmlToMarkdown` stores them
 * as HTML and this module has to hand them back unescaped. Everything that
 * reads `markdownToHtml` re-parses against the TipTap schema (or `sanitizeHtml`
 * first), which is where unknown tags and attributes are actually dropped.
 */
const CUSTOM_BLOCK_HTML =
  /^\s*(?:<(?:div|span)\b(?=[^>]*\bdata-type="(?:callout|toggle|column-list|column|bookmark|embed|page-embed|excalidraw|block-math|inline-math|database|synced-block|paragraph|heading)")|<h[1-3]\b(?=[^>]*\bdata-collapsed="true"))/;
/** Inline custom markup is tokenized open-tag-first, so its close arrives alone. */
const BARE_CLOSING_TAG = /^\s*<\/(?:div|span|h[1-3])>\s*$/;

// Defense-in-depth: treat raw HTML in markdown as plain text so <script> and
// event-handler attributes never pass through marked into the editor pipeline.
marked.use({
  walkTokens(token) {
    if (token.type !== "html") return;
    const raw = (token as { raw?: string }).raw ?? "";
    if (CUSTOM_BLOCK_HTML.test(raw) || BARE_CLOSING_TAG.test(raw)) return;
    (token as { type: string }).type = "text";
    (token as { text: string }).text = raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  },
});

function preprocessMath(md: string): string {
  if (!md) return md;
  md = normalizeMathMarkdown(md);
  const fenceRe = /(^|\n)```[\s\S]*?\n```/g;
  let last = 0;
  const segs: { text: string; isCode: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(md)) !== null) {
    if (m.index > last) segs.push({ text: md.slice(last, m.index), isCode: false });
    segs.push({ text: m[0], isCode: true });
    last = m.index + m[0].length;
  }
  if (last < md.length) segs.push({ text: md.slice(last), isCode: false });

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  return segs
    .map((seg) => {
      if (seg.isCode) return seg.text;
      let text = seg.text;
      text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_f, latex) =>
        `\n\n<div data-type="block-math" data-latex="${esc(String(latex).trim())}"></div>\n\n`,
      );
      text = text.replace(/(^|[^\\$])\$([^\n$]+?)\$(?!\d)/g, (_f, pre, latex) =>
        `${pre}<span data-type="inline-math" data-latex="${esc(String(latex).trim())}"></span>`,
      );
      return text;
    })
    .join("");
}

/** `![Title](#page:id)` — written by the editor, carries the page id. */
const PAGE_EMBED_WITH_ID = new RegExp(`!\\[([^\\]]*)\\]\\(${PAGE_HREF_PREFIX}([^)\\s]+)\\)`, "g");
/** `![[Title]]` / `![[Title|alias]]` — typed by hand or authored in Obsidian. */
const PAGE_EMBED_WIKI = /!\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]/g;

/**
 * Turn embed syntax into the node's HTML shape before `marked` sees it.
 *
 * `resolvePageId` recovers the id for embeds written without one, so a vault
 * file authored outside Wings still renders a live card instead of "not found".
 */
function preprocessPageEmbeds(md: string, resolvePageId?: (title: string) => string | null): string {
  if (!md.includes("![")) return md;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const embed = (title: string, display: string, pageId: string | null) => {
    const idAttr = pageId ? ` data-page-id="${esc(pageId)}"` : "";
    return `\n\n<div data-type="page-embed"${idAttr} data-title="${esc(title)}" data-page-title="${esc(display)}"></div>\n\n`;
  };
  return md
    .replace(PAGE_EMBED_WITH_ID, (_match, rawTitle, pageId) => {
      const title = String(rawTitle).trim() || "Untitled";
      return embed(title, title, String(pageId).trim());
    })
    .replace(PAGE_EMBED_WIKI, (_match, rawTitle, alias) => {
      const title = String(rawTitle).trim();
      const display = String(alias ?? title).trim();
      return embed(title, display, resolvePageId?.(title) ?? null);
    });
}

export function markdownToHtml(md: string, resolvePageId?: (title: string) => string | null): string {
  if (!md) return "";
  const prepared = preprocessPageEmbeds(preprocessMath(md), resolvePageId);
  return marked.parse(prepared, { async: false }) as string;
}
