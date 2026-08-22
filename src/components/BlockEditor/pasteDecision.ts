/**
 * Decide whether clipboard text/plain should win over text/html.
 *
 * Chrome, Slack, GitHub, and VS Code almost always attach HTML. That HTML is
 * often span soup or a line-number table, so pasting it loses fences and lists.
 */

export function looksLikeMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    /^#{1,6}\s/m.test(t) ||
    /^\s*[-*+]\s/m.test(t) ||
    /^\s*\d+\.\s/m.test(t) ||
    /```/.test(t) ||
    /\*\*[^*]+\*\*/.test(t) ||
    /^>\s/m.test(t) ||
    /^\s*-\s\[[ x]\]/m.test(t)
  );
}

function countTags(html: string, tag: string): number {
  return html.match(new RegExp(`<${tag}\\b`, "gi"))?.length ?? 0;
}

/** GitHub file view uses a <table> for line numbers — not a content table. */
function hasContentTable(html: string): boolean {
  if (!/<table\b/i.test(html)) return false;
  if (/\b(?:blob-num|js-file-line|data-line-number)\b/i.test(html)) return false;
  return true;
}

function hasProtectedHtml(html: string): boolean {
  if (/<img\b/i.test(html)) return true;
  if (/\bdata-type\s*=/i.test(html)) return true;
  return hasContentTable(html);
}

function isPreWrapped(html: string): boolean {
  return /<pre\b/i.test(html);
}

function isChatAppJunk(html: string): boolean {
  const spans = countTags(html, "span");
  const blocks = countTags(html, "(?:p|h[1-6]|ul|ol|li|blockquote)");
  return spans >= 3 && spans > blocks;
}

function isGithubBlobChrome(html: string): boolean {
  return /\b(?:blob-num|js-file-line|data-line-number)\b/i.test(html);
}

function isDivSoup(html: string): boolean {
  const blocks = countTags(html, "(?:p|h[1-6]|ul|ol|li|blockquote|table)");
  const divs = countTags(html, "div");
  return blocks === 0 && divs >= 1;
}

/**
 * True when the HTML is a worse representation than the markdown in `text`.
 * Keep HTML for images, real tables, and our own `data-type` blocks.
 */
export function markdownWinsOverHtml(html: string, text: string): boolean {
  if (!html.includes("<")) return true;
  if (hasProtectedHtml(html)) return false;
  if (isGithubBlobChrome(html)) return true;
  if (isPreWrapped(html)) return true;
  if (isChatAppJunk(html)) return true;
  if (isDivSoup(html)) return true;
  if (/```/.test(text) && countTags(html, "(?:p|h[1-6]|ul|ol|li|blockquote)") === 0) return true;
  return false;
}

export function shouldPasteAsMarkdown(text: string, html: string): boolean {
  if (!text || !looksLikeMarkdown(text)) return false;
  if (!html) return true;
  return markdownWinsOverHtml(html, text);
}
