import { Extension, InputRule } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { normalizeCodeLanguage } from "./codeLanguages";
import {
  calloutEmojiFromToken,
  isConvertibleParagraph,
  isInsideNode,
  isMarkdownSuggestionOpen,
  matchDelimited,
} from "./markdownInput";

/**
 * Convert markdown when the user types space.
 *
 * StarterKit already turns `# `, `- `, `1. `, `> `, and closing `**` / `*`
 * into structure. This fills the holes: `[ ] `, fences, 3+ HR, `***`,
 * `~~` / `==` / `` ` `` on space, and `> [!note]`.
 *
 * Enter still converts fence/HR in WritingExperience — do not remove that.
 * InputRule already skips IME composing and code marks/nodes.
 */
function applySpaceMarks(markNames: string[]) {
  return ({
    state,
    range,
    match,
  }: {
    state: EditorState;
    range: { from: number; to: number };
    match: RegExpMatchArray;
  }) => {
    if (isMarkdownSuggestionOpen(state)) return null;
    const inner = match[1];
    if (!inner) return null;
    const { tr, schema } = state;
    tr.delete(range.from, range.to);
    tr.insertText(`${inner} `, range.from);
    const from = range.from;
    const to = from + inner.length;
    for (const name of markNames) {
      const type = schema.marks[name];
      if (type) tr.addMark(from, to, type.create());
    }
  };
}

export const MarkdownInput = Extension.create({
  name: "markdownInput",

  addInputRules() {
    const marks = this.editor.schema.marks;
    const rules: InputRule[] = [
      new InputRule({
        find: /^(```|~~~)([\w#+.+-]*) $/,
        handler: ({ state, range, match, chain }) => {
          if (isMarkdownSuggestionOpen(state) || !isConvertibleParagraph(state)) return null;
          const language = normalizeCodeLanguage(match[2] || null);
          const ran =
            language === "plaintext"
              ? chain().deleteRange(range).setCodeBlock().run()
              : chain().deleteRange(range).setCodeBlock({ language }).run();
          if (!ran) return null;
        },
      }),
      new InputRule({
        find: /^\[( |x|X)\] $/,
        handler: ({ state, range, match, chain }) => {
          if (isMarkdownSuggestionOpen(state) || !isConvertibleParagraph(state)) return null;
          const checked = match[1] !== " ";
          let next = chain().deleteRange(range).toggleTaskList();
          if (checked) next = next.updateAttributes("taskItem", { checked: true });
          if (!next.run()) return null;
        },
      }),
      new InputRule({
        find: /^(-{3,}|\*{3,}|_{3,}) $/,
        handler: ({ state, range, chain }) => {
          if (isMarkdownSuggestionOpen(state) || !isConvertibleParagraph(state)) return null;
          if (!chain().deleteRange(range).setHorizontalRule().run()) return null;
        },
      }),
      new InputRule({
        find: /^\[!([^\]]+)\] $/,
        handler: ({ state, range, match, chain }) => {
          if (isMarkdownSuggestionOpen(state)) return null;
          if (!isInsideNode(state, "blockquote")) return null;
          const emoji = calloutEmojiFromToken(match[1] ?? "");
          if (!chain().deleteRange(range).toggleBlockquote().setCallout({ emoji }).run()) {
            return null;
          }
        },
      }),
    ];

    if (marks.bold && marks.italic) {
      rules.push(
        new InputRule({
          find: (text) => matchDelimited(text, "***"),
          handler: applySpaceMarks(["bold", "italic"]),
        }),
      );
    }

    const markPairs: { delim: string; names: string[] }[] = [
      { delim: "**", names: ["bold"] },
      { delim: "~~", names: ["strike"] },
      { delim: "==", names: ["highlight"] },
      { delim: "`", names: ["code"] },
      { delim: "*", names: ["italic"] },
      { delim: "_", names: ["italic"] },
    ];

    for (const { delim, names } of markPairs) {
      if (!names.every((name) => marks[name])) continue;
      rules.push(
        new InputRule({
          find: (text) => matchDelimited(text, delim),
          handler: applySpaceMarks(names),
        }),
      );
    }

    return rules;
  },
});
