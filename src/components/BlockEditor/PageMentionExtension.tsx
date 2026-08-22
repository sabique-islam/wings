import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { pageMentionSuggestionKey } from "./suggestionPluginKeys";
import { renderPageSuggestions } from "./PageSuggestionList";
import { matchPages } from "./pageSuggestions";
import { insertPageRefAtRange } from "./pageRef";

export interface PageOption {
  id: string;
  title: string;
}

export function createPageMentionExtension(
  getPages: () => PageOption[],
  onCreatePage?: (title: string) => void,
) {
  return Extension.create({
    name: "pageMention",
    // Above WritingExperience (200) so Enter and the arrow keys reach the open
    // picker instead of splitting the block underneath it.
    priority: 500,
    addOptions() {
      return {
        suggestion: {
          char: "@",
          allowSpaces: true,
          command: ({ editor, range, props }: any) => {
            insertPageRefAtRange(editor, range, (props as PageOption).id);
          },
          items: ({ query }: { query: string }) => matchPages(getPages(), query),
          render: () => {
            const renderer = renderPageSuggestions();
            const withCreate = (props: any) => ({
              ...props,
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
        },
      };
    },
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
          pluginKey: pageMentionSuggestionKey,
        }),
      ];
    },
  });
}
