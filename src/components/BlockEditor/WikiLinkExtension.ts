import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { wikiLinkFullwidthSuggestionKey, wikiLinkSuggestionKey } from "./suggestionPluginKeys";
import { renderPageSuggestions } from "./PageSuggestionList";
import { matchPages, wikiLinkQuery } from "./pageSuggestions";
import { insertPageRefAtRange } from "./pageRef";
import type { PageOption } from "./PageMentionExtension";

function wikiLinkSuggestion(
  char: string,
  getPages: () => PageOption[],
  onCreatePage?: (title: string) => void,
) {
  return {
    char,
    allowSpaces: true,
    allowedPrefixes: null as string[] | null,
    allow:
      char === "[["
        ? ({ state, range }: { state: EditorState; range: { from: number } }) =>
            state.doc.textBetween(Math.max(0, range.from - 1), range.from) !== "!"
        : undefined,
    command: ({ editor, range, props }: any) => {
      insertPageRefAtRange(editor, range, (props as PageOption).id);
    },
    items: ({ query }: { query: string }) => matchPages(getPages(), wikiLinkQuery(query)),
    render: () => {
      const renderer = renderPageSuggestions();
      const withCreate = (props: any) => ({
        ...props,
        query: wikiLinkQuery(props.query ?? ""),
        onCreate: onCreatePage
          ? (title: string) => {
              props.editor.chain().focus().deleteRange(props.range).run();
              onCreatePage(title);
            }
          : undefined,
      });
      return {
        ...renderer,
        onStart: (props: any) => renderer.onStart(withCreate(props)),
        onUpdate: (props: any) => renderer.onUpdate(withCreate(props)),
      };
    },
  };
}

/**
 * `[[` and `【【` page linking.
 *
 * The chosen page is inserted as a pageRef atom keyed by id. The visible label
 * is read from the page list so a rename updates every chip without rewriting
 * the document.
 */
export function createWikiLinkExtension(
  getPages: () => PageOption[],
  onCreatePage?: (title: string) => void,
) {
  return Extension.create({
    name: "wikiLink",
    // Above WritingExperience (200) so Enter and the arrow keys reach the open
    // picker instead of splitting the block underneath it.
    priority: 500,
    addOptions() {
      return {
        suggestion: wikiLinkSuggestion("[[", getPages, onCreatePage),
      };
    },
    addProseMirrorPlugins() {
      const brackets = wikiLinkSuggestion("[[", getPages, onCreatePage);
      const fullwidth = wikiLinkSuggestion("【【", getPages, onCreatePage);
      return [
        Suggestion({
          editor: this.editor,
          ...brackets,
          pluginKey: wikiLinkSuggestionKey,
        }),
        Suggestion({
          editor: this.editor,
          ...fullwidth,
          pluginKey: wikiLinkFullwidthSuggestionKey,
        }),
      ];
    },
  });
}
