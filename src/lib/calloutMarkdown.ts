import { CALLOUT_ICON_OPTIONS } from "./calloutIcons";

/**
 * GFM / Obsidian callout blocks: a quote whose first line is `[!…]`
 * (emoji or a name like `note` / `warning Title`).
 */

export type GfmCalloutBlock = {
  start: number;
  end: number;
  token: string;
  title: string;
  body: string;
};

/** Names → Wings picker emoji. Extra GFM/Obsidian names map onto the closest existing icon. */
const CALLOUT_TOKEN_EMOJI: Record<string, string> = {
  note: "💬",
  info: "💡",
  tip: "💡",
  hint: "💡",
  idea: "💡",
  warning: "⚠️",
  caution: "⚠️",
  attention: "⚠️",
  success: "✅",
  check: "✅",
  done: "✅",
  danger: "❌",
  error: "❌",
  failure: "❌",
  fail: "❌",
  missing: "❌",
  blocked: "❌",
  important: "🔥",
  fire: "🔥",
  pin: "📌",
  example: "📌",
  goal: "🎯",
  star: "⭐",
  write: "📝",
  question: "💬",
  quote: "💬",
  cite: "💬",
  faq: "💬",
};

/** Map Obsidian/GFM `[!note]` / `[!💡]` to a Wings callout emoji. */
export function calloutEmojiFromToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "💡";
  if (CALLOUT_ICON_OPTIONS.some((opt) => opt.emoji === trimmed)) return trimmed;
  return CALLOUT_TOKEN_EMOJI[trimmed.toLowerCase()] ?? "💡";
}

/** `[!💡]` or `[!note]` / `[!warning] Title`. */
const CALLOUT_HEAD = /^\[!([^\]]+)\](?:[ \t]+(.+))?/;

export function parseGfmCalloutLine(line: string): { token: string; title: string } | null {
  const stripped = line.replace(/^>\s?/, "").trimEnd();
  const match = stripped.match(CALLOUT_HEAD);
  if (!match) return null;
  return { token: (match[1] ?? "").trim(), title: (match[2] ?? "").trim() };
}

function splitFences(md: string): { text: string; isCode: boolean }[] {
  const fenceRe = /(^|\n)```[\s\S]*?\n```/g;
  const segs: { text: string; isCode: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(md)) !== null) {
    if (m.index > last) segs.push({ text: md.slice(last, m.index), isCode: false });
    segs.push({ text: m[0], isCode: true });
    last = m.index + m[0].length;
  }
  if (last < md.length) segs.push({ text: md.slice(last), isCode: false });
  return segs.length ? segs : [{ text: md, isCode: false }];
}

function unquote(line: string): string {
  if (line === ">" || /^>\s*$/.test(line)) return "";
  return line.replace(/^>\s?/, "");
}

export function findGfmCalloutBlocks(md: string): GfmCalloutBlock[] {
  const found: GfmCalloutBlock[] = [];
  let offset = 0;
  for (const seg of splitFences(md)) {
    if (!seg.isCode) {
      const re = /(^|\n)(>\s*\[![^\]]+\][^\n]*(?:\n>[^\n]*)*)/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(seg.text)) !== null) {
        const prefix = match[1] ?? "";
        const raw = match[2] ?? "";
        const lines = raw.split("\n");
        const head = parseGfmCalloutLine(lines[0] ?? "");
        if (!head) continue;
        found.push({
          start: offset + match.index + prefix.length,
          end: offset + match.index + prefix.length + raw.length,
          token: head.token,
          title: head.title,
          body: lines.slice(1).map(unquote).join("\n"),
        });
      }
    }
    offset += seg.text.length;
  }
  return found;
}
