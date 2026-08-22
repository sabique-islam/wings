import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { isMarkdownSuggestionOpen } from "./markdownInput";
import { insertPageRefAtRange } from "./pageRef";
import type { PageOption } from "./PageMentionExtension";
import {
  WRAP_PAIRS,
  innerRangeAfterWrap,
  isBracketWrapped,
  pageIdForTitle,
  shouldSkipCodeCloser,
} from "./selectionWrap";

const selectionWrapKey = new PluginKey("selectionWrap");

function sameTextblock(view: EditorView): boolean {
  const { $from, $to } = view.state.selection;
  return $from.parent === $to.parent && $from.parent.isTextblock;
}

function inCodeBlock(view: EditorView): boolean {
  return view.state.selection.$from.parent.type.name === "codeBlock";
}

function wrapWithPair(view: EditorView, open: string, close: string): boolean {
  const { from, to } = view.state.selection;
  const tr = view.state.tr.insertText(close, to).insertText(open, from);
  const inner = innerRangeAfterWrap(from, to);
  tr.setSelection(TextSelection.create(tr.doc, inner.from, inner.to));
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function createSelectionWrapExtension(options: {
  getPages?: () => PageOption[];
  onNewPage?: (title: string) => void;
} = {}) {
  const getPages = options.getPages ?? (() => []);
  const onNewPage = options.onNewPage;

  return Extension.create({
    name: "selectionWrap",
    // Above WritingExperience (200), below slash/@ (500). `/` is not a wrap key.
    priority: 350,

    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin({
          key: selectionWrapKey,
          props: {
            handleKeyDown(view, event) {
              if (event.metaKey || event.ctrlKey || event.altKey) return false;
              if (event.isComposing) return false;
              if (isMarkdownSuggestionOpen(view.state)) return false;
              if (!sameTextblock(view)) return false;

              const { empty, from, to } = view.state.selection;
              const typed = event.key;
              const code = inCodeBlock(view);

              if (code && empty && shouldSkipCodeCloser(typed, view.state.doc.textBetween(from, from + 1))) {
                event.preventDefault();
                const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from + 1));
                view.dispatch(tr);
                return true;
              }

              if (code && empty && WRAP_PAIRS[typed]) {
                const [open, close] = WRAP_PAIRS[typed];
                event.preventDefault();
                return wrapWithPair(view, open, close);
              }

              if (empty) return false;

              if (typed === "`" && !code) {
                event.preventDefault();
                return editor.chain().focus().toggleCode().run();
              }

              const pair = WRAP_PAIRS[typed];
              if (!pair) return false;

              if (typed === "[") {
                const before = from > 0 ? view.state.doc.textBetween(from - 1, from) : "";
                const after = to < view.state.doc.content.size ? view.state.doc.textBetween(to, to + 1) : "";
                if (isBracketWrapped(before, after)) {
                  const title = view.state.doc.textBetween(from, to);
                  const pageId = pageIdForTitle(title, getPages());
                  event.preventDefault();
                  if (pageId) {
                    insertPageRefAtRange(editor, { from: from - 1, to: to + 1 }, pageId);
                    return true;
                  }
                  onNewPage?.(title.trim());
                  return wrapWithPair(view, "[", "]");
                }
              }

              if (code && typed === "`") {
                event.preventDefault();
                return wrapWithPair(view, "`", "`");
              }

              if (typed === "`") return false;

              event.preventDefault();
              return wrapWithPair(view, pair[0], pair[1]);
            },
          },
        }),
      ];
    },
  });
}
