import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Wrapper that holds a text block plus nested siblings.
 *
 * ProseMirror cannot mix `inline*` and `block*` on one node, so Tab cannot put
 * a paragraph inside a paragraph. Nesting wraps the previous textblock and the
 * current one in this node instead. Leaf paragraphs still render as `<p>`.
 */
export const OutlineBlock = Node.create({
  name: "outlineBlock",
  group: "block",
  content: "block+",

  parseHTML() {
    return [{ tag: 'div[data-type="paragraph"]' }, { tag: 'div[data-type="heading"]' }, { tag: 'div[data-type="outline"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const first = node.firstChild;
    if (first?.type.name === "heading") {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-type": "heading",
          "data-level": String(first.attrs.level ?? 1),
        }),
        0,
      ];
    }
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "paragraph" }), 0];
  },
});
