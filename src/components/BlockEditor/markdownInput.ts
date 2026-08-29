import type { InputRuleMatch } from "@tiptap/core";
import type { EditorState, PluginKey } from "@tiptap/pm/state";
import { calloutEmojiFromToken } from "@/lib/calloutMarkdown";
import {
  pageMentionSuggestionKey,
  slashCommandSuggestionKey,
  wikiEmbedSuggestionKey,
  wikiLinkFullwidthSuggestionKey,
  wikiLinkSuggestionKey,
} from "./suggestionPluginKeys";

export { calloutEmojiFromToken };

const SUGGESTION_KEYS: PluginKey[] = [
  slashCommandSuggestionKey,
  pageMentionSuggestionKey,
  wikiLinkSuggestionKey,
  wikiLinkFullwidthSuggestionKey,
  wikiEmbedSuggestionKey,
];

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

/** Space input-rule: fence token plus the trailing space. */
export const CODE_FENCE_SPACE = /^(```|~~~)([\w#+.+-]*) $/;

/** Space input-rule: 3+ hyphen/asterisk/underscore plus the trailing space. */
export const HORIZONTAL_RULE_SPACE = /^(-{3,}|\*{3,}|_{3,}) $/;

/** Fence line without requiring a trailing space (Enter). */
export function matchCodeFenceMarkup(text: string): { language: string } | null {
  const match = text.trim().match(/^(```|~~~)([\w#+.+-]*)$/);
  if (!match) return null;
  return { language: match[2] ?? "" };
}

/** HR line without requiring a trailing space (Enter). */
export function isHorizontalRuleMarkup(text: string): boolean {
  return /^(-{3,}|\*{3,}|_{3,})$/.test(text.trim());
}

export function isInsideNode(state: EditorState, name: string): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === name) return true;
  }
  return false;
}

/**
 * Convert `**word** ` / `***x*** ` on the trailing space, not on the
 * closing delimiter. Inner text may contain spaces but must not start
 * or end with whitespace.
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
