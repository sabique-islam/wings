import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/*
 * Always keep an empty paragraph after the last non-paragraph block so the
 * caret can sit below a fence, image, table, or divider.
 */
const trailingNodeKey = new PluginKey<boolean>("trailingNode");

export const TrailingNode = Extension.create({
  name: "trailingNode",

  addProseMirrorPlugins() {
    const nodeName = "paragraph";

    return [
      new Plugin({
        key: trailingNodeKey,
        appendTransaction: (_transactions, _oldState, newState) => {
          if (!trailingNodeKey.getState(newState)) return null;
          const type = newState.schema.nodes[nodeName];
          if (!type) return null;
          return newState.tr.insert(newState.doc.content.size, type.create());
        },
        state: {
          init: (_, state) => state.doc.lastChild?.type.name !== nodeName,
          apply: (tr, value) => {
            if (!tr.docChanged) return value;
            if (tr.getMeta("__uniqueIDTransaction")) return value;
            return tr.doc.lastChild?.type.name !== nodeName;
          },
        },
      }),
    ];
  },
});
