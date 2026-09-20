// HTML file import → Wings markdown.
//
// Notion's "Export → HTML" (and ordinary .html notes) are full documents: CSS,
// KaTeX glyph soup, a generated TOC, and one <ul>/<ol> per bullet. We walk the
// page body, keep the structures the editor can actually render, and emit
// markdown that `markdownToHtml` already understands.

import { markdownToHtml } from "./markdown";

const SKIP_TAGS = new Set([
  "STYLE",
  "SCRIPT",
  "NOSCRIPT",
  "TEMPLATE",
  "LINK",
  "META",
  "HEAD",
  "SVG",
  "CANVAS",
]);

const LIST_TAGS = new Set(["UL", "OL"]);

export function isHtmlFileName(name: string): boolean {
  return /\.html?$/i.test(name);
}

export function parseHtmlImport(raw: string, fallbackTitle?: string): { title: string; body: string } {
  const html = raw.replace(/^\uFEFF/, "").trim();
  if (!html) {
    const title = (fallbackTitle || "Untitled").trim() || "Untitled";
    return { title, body: `# ${title}` };
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const el of Array.from(doc.querySelectorAll("style, script, noscript, template, link, meta"))) {
    el.remove();
  }
  for (const el of Array.from(doc.querySelectorAll("nav.table_of_contents, [data-notion-toc]"))) {
    el.remove();
  }

  const title = pickTitle(doc, fallbackTitle);
  const root =
    doc.querySelector(".page-body") ||
    doc.querySelector("article") ||
    doc.querySelector("main") ||
    doc.body;

  const bodyMd = root ? serializeChildren(root).trim() : "";
  const withoutLeadingRules = bodyMd.replace(/^(?:---\s*\n+)+/, "").trim();
  const heading = `# ${title}`;
  const rest = stripMatchingLeadingHeading(withoutLeadingRules, title);
  const body = rest ? `${heading}\n\n${rest}` : heading;
  return { title, body };
}

function pickTitle(doc: Document, fallbackTitle?: string): string {
  const pageTitle = textOf(doc.querySelector("h1.page-title"));
  if (pageTitle) return pageTitle;
  const docTitle = (doc.querySelector("title")?.textContent || "").trim();
  if (docTitle) return decodeEntities(docTitle);
  const firstHeading = textOf(doc.querySelector("h1, h2, h3"));
  if (firstHeading) return firstHeading;
  const fallback = (fallbackTitle || "").trim();
  return fallback || "Untitled";
}

function stripMatchingLeadingHeading(md: string, title: string): string {
  const match = md.match(/^#\s+(.+)\n*/);
  if (!match) return md;
  if (match[1].trim() === title) return md.slice(match[0].length).trim();
  return md;
}

function serializeChildren(parent: ParentNode): string {
  return serializeNodeList(significantChildren(parent));
}

function serializeNodeList(nodes: ChildNode[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i]!;
    if (isElement(node) && LIST_TAGS.has(node.tagName)) {
      const tag = node.tagName;
      const group: Element[] = [];
      while (i < nodes.length) {
        const next = nodes[i];
        if (!isElement(next) || next.tagName !== tag || !shouldMergeList(group, next)) break;
        group.push(next);
        i += 1;
      }
      parts.push(serializeMergedList(group));
      continue;
    }
    parts.push(serializeNode(node));
    i += 1;
  }
  return squash(parts.join(""));
}

function shouldMergeList(group: Element[], next: Element): boolean {
  if (group.length === 0) return true;
  if (next.classList.contains("bulleted-list") || next.classList.contains("numbered-list")) return true;
  const allSingles = [...group, next].every((el) => directListItems(el).length <= 1);
  return allSingles;
}

function serializeMergedList(lists: Element[]): string {
  if (lists.length === 0) return "";
  const ordered = lists[0]!.tagName === "OL";
  const items = lists.flatMap(directListItems);
  if (items.length === 0) return "";
  const start = ordered ? readOlStart(lists[0]!) : 1;
  const lines = items.map((li, idx) => serializeListItem(li, ordered ? `${start + idx}. ` : "- "));
  return `\n\n${lines.join("\n")}\n\n`;
}

function serializeListItem(li: Element, bullet: string): string {
  const nodes = significantChildren(li);
  const inlineNodes: ChildNode[] = [];
  const blockNodes: ChildNode[] = [];
  let sawBlock = false;
  for (const node of nodes) {
    if (!sawBlock && !isBlockChild(node)) inlineNodes.push(node);
    else {
      sawBlock = true;
      blockNodes.push(node);
    }
  }
  const title = serializeInlines(inlineNodes).trim();
  const nested = blockNodes.length ? serializeNodeList(blockNodes).trim() : "";
  const head = `${bullet}${title}`.trimEnd();
  if (!nested) return head || `${bullet}`.trimEnd();
  const indented = nested
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
  return title ? `${head}\n${indented}` : `${bullet.trimEnd()}\n${indented}`;
}

function serializeNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    return text ? `\n\n${text}\n\n` : "";
  }
  if (!isElement(node)) return "";
  if (SKIP_TAGS.has(node.tagName)) return "";
  if (node.tagName === "NAV") return "";
  if (node.classList.contains("page-header-icon")) return "";
  if (node.classList.contains("page-title")) return "";
  if (node.classList.contains("page-description") && !textOf(node)) return "";
  if (node.classList.contains("table_of_contents")) return "";

  if (/^H[1-6]$/.test(node.tagName)) {
    const level = Math.min(3, Number(node.tagName[1]) || 1);
    const text = serializeInline(node).trim();
    return text ? `\n\n${"#".repeat(level)} ${text}\n\n` : "";
  }
  if (node.tagName === "P") {
    const text = serializeInline(node).trim();
    return text ? `\n\n${text}\n\n` : "";
  }
  if (node.tagName === "HR") return "\n\n---\n\n";
  if (node.tagName === "BR") return "  \n";
  if (node.tagName === "PRE") return serializePre(node);
  if (node.tagName === "TABLE") return serializeTable(node);
  if (node.tagName === "BLOCKQUOTE") {
    const inner = serializeChildren(node).trim();
    if (!inner) return "";
    const quoted = inner
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n");
    return `\n\n${quoted}\n\n`;
  }
  if (isEquation(node)) return serializeEquation(node);
  if (isCallout(node)) return serializeCallout(node);
  if (node.tagName === "DETAILS") return serializeToggle(node);
  if (node.tagName === "IMG") return serializeImage(node);
  if (LIST_TAGS.has(node.tagName)) return serializeMergedList([node]);
  if (node.tagName === "LI") return serializeListItem(node, "- ");
  return serializeChildren(node);
}

function serializeInline(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return decodeUnicodeEscapes((node.textContent || "").replace(/\s+/g, " "));
  }
  if (!isElement(node)) return "";
  if (SKIP_TAGS.has(node.tagName)) return "";
  if (node.tagName === "BR") return "  \n";
  if (node.tagName === "IMG") return serializeImage(node).trim();
  const math = node.hasAttribute("data-notion-equation") ? serializeEquation(node) : "";
  if (math) return math.trim();

  const inner = serializeInlines(Array.from(node.childNodes));
  switch (node.tagName) {
    case "STRONG":
    case "B":
      return inner.trim() ? `**${inner.trim()}**` : "";
    case "EM":
    case "I":
      return inner.trim() ? `_${inner.trim()}_` : "";
    case "U":
      return inner ? `<u>${inner}</u>` : "";
    case "MARK":
      return inner.trim() ? `==${inner.trim()}==` : "";
    case "S":
    case "DEL":
      return inner.trim() ? `~~${inner.trim()}~~` : "";
    case "CODE":
      return serializeInlineCode(node);
    case "A":
      return serializeLink(node, inner);
    default:
      return inner;
  }
}

function serializeInlines(nodes: ChildNode[]): string {
  let out = "";
  for (const node of nodes) {
    const piece = serializeInline(node);
    if (!piece) continue;
    if (out && /[`*_]$/.test(out) && /^[`*_]/.test(piece)) out += " ";
    out += piece;
  }
  return out;
}

function serializeInlineCode(el: Element): string {
  const text = decodeUnicodeEscapes((el.textContent || "").replace(/\n+/g, " ").trim());
  if (!text) return "";
  const ticks = "`".repeat(longestTickRun(text) + 1);
  if (ticks.length === 1) return `\`${text}\``;
  return `${ticks} ${text} ${ticks}`;
}

function serializeLink(el: Element, inner: string): string {
  const href = (el.getAttribute("href") || "").trim();
  const label = inner.replace(/\s+/g, " ").trim();
  if (!href || href.startsWith("#")) return label;
  if (/\.(md|markdown|html|htm)(?:$|[?#])/i.test(href)) {
    const name = stripExportTitleId(decodeUriSafe(label || href));
    return name ? `[[${name}]]` : label;
  }
  if (!label) return href;
  return `[${label}](${href})`;
}

function serializePre(el: Element): string {
  const codeEl = el.querySelector("code") || el;
  const text = decodeUnicodeEscapes((codeEl.textContent || "").replace(/\n$/, ""));
  const lang = codeLanguage(el, codeEl);
  const fence = "`".repeat(Math.max(3, longestTickRun(text) + 1));
  return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
}

function codeLanguage(pre: Element, code: Element): string {
  const notion = (pre.getAttribute("data-notion-code-syntax") || "").trim();
  if (notion) return sanitizeLang(notion);
  const cls = `${pre.className} ${code.className}`;
  const match = cls.match(/language-([a-z0-9_+-]+)/i);
  return match ? sanitizeLang(match[1]) : "";
}

function sanitizeLang(lang: string): string {
  return lang.toLowerCase().replace(/[^a-z0-9_+-]/g, "");
}

function serializeTable(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr")).filter((tr) => tr.closest("table") === table);
  if (rows.length === 0) return "";
  const cells = rows.map((tr) =>
    Array.from(tr.children)
      .filter((child) => child.tagName === "TH" || child.tagName === "TD")
      .map((cell) => serializeInline(cell).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim()),
  );
  const width = Math.max(1, ...cells.map((row) => row.length));
  const padded = cells.map((row) => {
    const next = [...row];
    while (next.length < width) next.push("");
    return next;
  });
  const header = padded[0]!;
  const body = padded.slice(1);
  const headerLine = `| ${header.join(" | ")} |`;
  const sep = `| ${header.map(() => "---").join(" | ")} |`;
  const bodyLines = body.map((row) => `| ${row.join(" | ")} |`);
  return `\n\n${[headerLine, sep, ...bodyLines].join("\n")}\n\n`;
}

function serializeEquation(el: Element): string {
  const latex =
    decodeEntities(el.getAttribute("data-notion-equation") || "") ||
    textOf(el.querySelector("annotation[encoding='application/x-tex']")) ||
    textOf(el.querySelector("annotation"));
  if (!latex) return "";
  // KaTeX glyph spans are unreadable as text; drop the figure if we have no TeX.
  if (el.querySelector(".katex") && !el.getAttribute("data-notion-equation") && !el.querySelector("annotation")) {
    return "";
  }
  return `\n\n$$\n${latex.trim()}\n$$\n\n`;
}

function isEquation(el: Element): boolean {
  return (
    el.classList.contains("equation") ||
    el.hasAttribute("data-notion-equation") ||
    (el.tagName === "FIGURE" && Boolean(el.querySelector(".katex, annotation")))
  );
}

function isCallout(el: Element): boolean {
  return el.classList.contains("callout") || el.tagName === "ASIDE";
}

function serializeCallout(el: Element): string {
  const emoji =
    el.querySelector("[data-emoji]")?.getAttribute("data-emoji") ||
    textOf(el.querySelector(".icon, .callout-icon")) ||
    "💡";
  const contentRoot =
    el.querySelector(".callout-content") ||
    (el.children.length > 1 ? el.children[el.children.length - 1]! : el);
  const innerMd = serializeChildren(contentRoot).trim();
  const innerHtml = innerMd ? markdownToHtml(innerMd).trim() : "<p></p>";
  const safeEmoji = emoji.replace(/"/g, "&quot;").slice(0, 8) || "💡";
  return `\n\n<div data-type="callout" data-emoji="${safeEmoji}">${innerHtml || "<p></p>"}</div>\n\n`;
}

function serializeToggle(el: Element): string {
  const summaryEl = el.querySelector("summary");
  const summary = summaryEl ? serializeInline(summaryEl).trim() || "Toggle" : "Toggle";
  const clone = el.cloneNode(true) as Element;
  clone.querySelector("summary")?.remove();
  const innerMd = serializeChildren(clone).trim();
  const innerHtml = innerMd ? markdownToHtml(innerMd).trim() : "<p></p>";
  const safeSummary = summary.replace(/"/g, "&quot;");
  return `\n\n<div data-type="toggle" data-summary="${safeSummary}" data-open="true">${innerHtml || "<p></p>"}</div>\n\n`;
}

function serializeImage(el: Element): string {
  const src = (el.getAttribute("src") || "").trim();
  if (!src || src.startsWith("data:image/svg+xml")) return "";
  const alt = (el.getAttribute("alt") || "").replace(/\]/g, "").trim() || "image";
  return `\n\n![${alt}](${src})\n\n`;
}

function significantChildren(parent: ParentNode): ChildNode[] {
  return Array.from(parent.childNodes).filter((node) => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").trim().length > 0;
    if (!isElement(node)) return false;
    if (SKIP_TAGS.has(node.tagName)) return false;
    return true;
  });
}

function isBlockChild(node: ChildNode): boolean {
  if (!isElement(node)) return false;
  return (
    LIST_TAGS.has(node.tagName) ||
    node.tagName === "PRE" ||
    node.tagName === "TABLE" ||
    node.tagName === "P" ||
    node.tagName === "BLOCKQUOTE" ||
    node.tagName === "FIGURE" ||
    node.tagName === "DETAILS" ||
    node.tagName === "HR" ||
    /^H[1-6]$/.test(node.tagName)
  );
}

function directListItems(list: Element): Element[] {
  return Array.from(list.children).filter((child) => child.tagName === "LI");
}

function readOlStart(ol: Element): number {
  const raw = Number(ol.getAttribute("start") || "1");
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function textOf(el: Element | null): string {
  return (el?.textContent || "").replace(/\s+/g, " ").trim();
}

function isElement(node: ChildNode | ParentNode): node is Element {
  return (node as Node).nodeType === Node.ELEMENT_NODE;
}

function squash(md: string): string {
  return md.replace(/\n{3,}/g, "\n\n");
}

function longestTickRun(text: string): number {
  const runs = text.match(/`+/g);
  if (!runs) return 0;
  return runs.reduce((max, run) => Math.max(max, run.length), 0);
}

function decodeUnicodeEscapes(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function decodeEntities(value: string): string {
  if (!value || !value.includes("&")) return value;
  const ta = document.createElement("textarea");
  ta.innerHTML = value;
  return ta.value;
}

function decodeUriSafe(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\.(md|markdown|html|htm)(?:[?#].*)?$/i, ""));
  } catch {
    return value;
  }
}

export function stripExportTitleId(title: string): string {
  const withoutId = title.replace(/\s+[a-f0-9]{32}$/i, "");
  if (withoutId === title) return title.trim();
  return withoutId.replace(/\s+[—–-]\s*$/, "").trim() || title.trim();
}
