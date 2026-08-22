/**
 * Turn ChatGPT / Claude / LaTeX dump syntax into `$…$` / `$$…$$` so the
 * existing KaTeX pipeline can render it. Code fences and inline code stay put.
 */

const FENCE_RE = /(^|\n)```[^\n]*\n[\s\S]*?\n```/g;
const INLINE_CODE_RE = /`[^`\n]+`/g;
const BLOCK_DOLLAR_RE = /\$\$[\s\S]+?\$\$/g;
const INLINE_DOLLAR_RE = /(?<![\\$])\$[^\n$]+?\$/g;

const DISPLAY_ENV =
  "equation\\*?|align\\*?|gather\\*?|multline\\*?|eqnarray\\*?";

const MATH_FENCE_RE =
  /(^|\n)```(?:math|latex|tex)[^\n]*\n([\s\S]*?)\n```/gi;

type Segment = { text: string; protected: boolean };

function splitByRegex(text: string, re: RegExp): Segment[] {
  const flags = re.global ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  const segs: Segment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = global.exec(text)) !== null) {
    if (match.index > last) {
      segs.push({ text: text.slice(last, match.index), protected: false });
    }
    segs.push({ text: match[0], protected: true });
    last = match.index + match[0].length;
    if (match[0].length === 0) global.lastIndex += 1;
  }
  if (last < text.length) segs.push({ text: text.slice(last), protected: false });
  return segs.length ? segs : [{ text, protected: false }];
}

function mapUnprotected(
  text: string,
  guards: RegExp[],
  rewrite: (plain: string) => string,
): string {
  let segs: Segment[] = [{ text, protected: false }];
  for (const guard of guards) {
    segs = segs.flatMap((seg) => (seg.protected ? [seg] : splitByRegex(seg.text, guard)));
  }
  return segs.map((seg) => (seg.protected ? seg.text : rewrite(seg.text))).join("");
}

const CODE_GUARDS = [FENCE_RE, INLINE_CODE_RE];
const MATH_GUARDS = [...CODE_GUARDS, BLOCK_DOLLAR_RE, INLINE_DOLLAR_RE];

/** True when the string is actual TeX, not a markdown link, wiki, or citation. */
export function looksLikeLatex(src: string): boolean {
  return /\\[a-zA-Z]+/.test(src);
}

/**
 * ChatGPT copy often drops the backslash in `\,dx` (thin space before a differential).
 * Only restore that case — a bare comma in `\int_0,1` stays put.
 */
export function restoreChatGptLatexEscapes(latex: string): string {
  return latex.replace(/(?<!\\),d([a-zA-Z])\b/g, "\\,d$1");
}

function wrapBlock(latex: string): string {
  const body = restoreChatGptLatexEscapes(latex.trim());
  if (!body) return "";
  return `\n\n$$\n${body}\n$$\n\n`;
}

function wrapInline(latex: string): string {
  const body = restoreChatGptLatexEscapes(latex.trim().replace(/\s*\n\s*/g, " "));
  if (!body) return "";
  return `$${body}$`;
}

function isLatexDocument(body: string): boolean {
  return /\\documentclass\b|\\begin\{document\}/.test(body);
}

function convertMathCodeFences(md: string): string {
  return md.replace(MATH_FENCE_RE, (full, lead: string, body: string) => {
    const info = full.match(/```(\w+)/i)?.[1]?.toLowerCase() ?? "";
    const trimmed = String(body ?? "").trim();
    if (!trimmed) return full;
    if (isLatexDocument(trimmed)) return full;
    if (info !== "math" && !looksLikeLatex(trimmed)) return full;
    return `${lead}${wrapBlock(trimmed)}`;
  });
}

function convertLatexDelimiters(plain: string): string {
  return plain
    .replace(/\\\[([\s\S]*?)\\\]/g, (_full, body: string) => wrapBlock(body))
    .replace(/\\\(([\s\S]*?)\\\)/g, (_full, body: string) => wrapInline(body));
}

function convertDisplayEnvs(plain: string): string {
  const re = new RegExp(`\\\\begin\\{(${DISPLAY_ENV})\\}([\\s\\S]*?)\\\\end\\{\\1\\}`, "g");
  return plain.replace(re, (full) => wrapBlock(full));
}

function convertBracketBlocks(plain: string): string {
  const multiline = plain.replace(/^\[\s*$\n([\s\S]*?)\n\]\s*$/gm, (full, body: string) =>
    looksLikeLatex(body) ? wrapBlock(body) : full,
  );
  return multiline.replace(
    /(?<!\[)\[(?!\[)([^\]\n]+)\](?!\()/g,
    (full, body: string) => (looksLikeLatex(body) ? wrapBlock(body) : full),
  );
}

/** Rewrite AI / LaTeX dump delimiters into `$` / `$$`. Idempotent on already-normalized markdown. */
export function normalizeMathMarkdown(md: string): string {
  if (!md) return md;
  let out = convertMathCodeFences(md);
  out = mapUnprotected(out, MATH_GUARDS, convertLatexDelimiters);
  out = mapUnprotected(out, MATH_GUARDS, convertDisplayEnvs);
  out = mapUnprotected(out, MATH_GUARDS, convertBracketBlocks);
  return out;
}

/** Clipboard plain text that the paste path should send through markdown math, not HTML dump. */
export function looksLikeMathMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\\\[|\\\]|\\\(|\\\)/.test(t)) return true;
  if (/\$\$/.test(t)) return true;
  if (/\\boxed\s*\{/.test(t)) return true;
  if (/\\begin\{(?:equation|align|gather|multline|eqnarray)/.test(t)) return true;
  if (/```(?:math|latex|tex)\b/i.test(t)) return true;
  if (/\\(?:int|frac|sum|prod|sqrt|lim|infty)\b/.test(t)) return true;
  if (/(?:^|[^\\$])\$[^\n$]*[\\^_{}][^\n$]*\$/.test(t)) return true;
  if (/^\s*\[\s*$/m.test(t) && /\\[a-zA-Z]+/.test(t)) return true;
  if (/(?<!\[)\[[^\n\[\]]*\\[a-zA-Z]+[^\n\[\]]*\](?!\()/.test(t)) return true;
  return false;
}

function texFromMathEl(el: Element): string | null {
  const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
  const fromAnn = annotation?.textContent?.trim();
  if (fromAnn) return restoreChatGptLatexEscapes(fromAnn);
  const data =
    el.getAttribute("data-latex") ||
    el.getAttribute("data-tex") ||
    el.getAttribute("aria-label");
  const trimmed = data?.trim();
  return trimmed ? restoreChatGptLatexEscapes(trimmed) : null;
}

function replaceWithMathNode(doc: Document, el: Element, tex: string, block: boolean) {
  const node = doc.createElement(block ? "div" : "span");
  node.setAttribute("data-type", block ? "block-math" : "inline-math");
  node.setAttribute("data-latex", tex);
  el.replaceWith(node);
}

/**
 * Pull TeX out of KaTeX / MathJax clipboard HTML. Returns HTML the editor can
 * parse as math nodes, or null when there is nothing to extract.
 */
export function extractMathHtmlFromClipboard(html: string): string | null {
  if (!html) return null;
  if (!/katex|math\/tex|application\/x-tex|mjx-container/i.test(html)) return null;
  if (typeof DOMParser === "undefined") return null;

  const doc = new DOMParser().parseFromString(html, "text/html");
  let replaced = false;

  for (const el of [...doc.querySelectorAll(".katex-display")]) {
    const tex = texFromMathEl(el);
    if (!tex) continue;
    replaceWithMathNode(doc, el, tex, true);
    replaced = true;
  }

  for (const el of [...doc.querySelectorAll(".katex")]) {
    if (el.closest('[data-type="block-math"]')) continue;
    const tex = texFromMathEl(el);
    if (!tex) continue;
    replaceWithMathNode(doc, el, tex, false);
    replaced = true;
  }

  for (const el of [...doc.querySelectorAll("script[type^='math/tex']")]) {
    const tex = restoreChatGptLatexEscapes((el.textContent || "").trim());
    if (!tex) continue;
    const display = (el.getAttribute("type") || "").includes("display");
    replaceWithMathNode(doc, el, tex, display);
    replaced = true;
  }

  for (const el of [...doc.querySelectorAll("mjx-container")]) {
    const tex = texFromMathEl(el);
    if (!tex) continue;
    const display = el.getAttribute("display") === "true";
    replaceWithMathNode(doc, el, tex, display);
    replaced = true;
  }

  if (!replaced) return null;
  return doc.body.innerHTML;
}
