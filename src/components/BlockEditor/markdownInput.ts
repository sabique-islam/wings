import type { InputRuleMatch } from "@tiptap/core";
import type { EditorState, PluginKey } from "@tiptap/pm/state";
import { CALLOUT_ICON_OPTIONS } from "@/lib/calloutIcons";
import {
  pageMentionSuggestionKey,
  slashCommandSuggestionKey,
  wikiEmbedSuggestionKey,
  wikiLinkFullwidthSuggestionKey,
  wikiLinkSuggestionKey,
} from "./suggestionPluginKeys";

const SUGGESTION_KEYS: PluginKey[] = [
  slashCommandSuggestionKey,
  pageMentionSuggestionKey,
  wikiLinkSuggestionKey,
  wikiLinkFullwidthSuggestionKey,
  wikiEmbedSuggestionKey,
];

const CALLOUT_TOKEN_EMOJI: Record<string, string> = {
  note: "💬",
  info: "💡",
  tip: "💡",
  hint: "💡",
  idea: "💡",
  warning: "⚠️",
  caution: "⚠️",
  success: "✅",
  check: "✅",
  done: "✅",
  danger: "❌",
  error: "❌",
  failure: "❌",
  blocked: "❌",
  important: "🔥",
  fire: "🔥",
  pin: "📌",
  goal: "🎯",
  star: "⭐",
  write: "📝",
  question: "💬",
  faq: "💬",
};

/** Map Obsidian/GFM `[!note]` / `[!💡]` to a Wings callout emoji. */
export function calloutEmojiFromToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "💡";
  if (CALLOUT_ICON_OPTIONS.some((opt) => opt.emoji === trimmed)) return trimmed;
  return CALLOUT_TOKEN_EMOJI[trimmed.toLowerCase()] ?? "💡";
}

export function isMarkdownSuggestionOpen(state: EditorState): boolean {
  return SUGGESTION_KEYS.some((key) => {
    const pluginState = key.getState(state) as { active?: boolean } | undefined;
    return pluginState?.active === true;
  });
}

const SKIP_BLOCK_TYPES = new Set([
  "listItem",
  "taskItem",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "callout",
  "toggleBlock",
  "codeBlock",
]);

/** True when the caret is in a top-level paragraph we can turn into a list/fence/HR. */
export function isConvertibleParagraph(state: EditorState): boolean {
  const { $from } = state.selection;
  if (!$from.parent?.isTextblock || $from.parent.type.name !== "paragraph") return false;
  for (let depth = $from.depth; depth > 0; depth--) {
    if (SKIP_BLOCK_TYPES.has($from.node(depth).type.name)) return false;
  }
  return true;
}

export function isInsideNode(state: EditorState, name: string): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === name) return true;
  }
  return false;
}

/**
 * AFFiNE-style: `**word** ` / `***x*** ` — convert on the trailing space,
 * not on the closing delimiter. Inner text may contain spaces but must not
 * start or end with whitespace.
 */
export function matchDelimited(text: string, delim: string): InputRuleMatch | null {
  if (!text.endsWith(" ") || delim.length === 0) return null;
  const before = text.slice(0, -1);
  if (!before.endsWith(delim)) return null;
  const closeAt = before.length - delim.length;
  if (closeAt < delim.length) return null;
  const openAt = before.lastIndexOf(delim, closeAt - delim.length);
  if (openAt < 0) return null;
  const inner = before.slice(openAt + delim.length, closeAt);
  if (!inner || /^\s/.test(inner) || /\s$/.test(inner)) return null;
  return {
    index: openAt,
    text: `${before.slice(openAt)} `,
    replaceWith: inner,
  };
}
