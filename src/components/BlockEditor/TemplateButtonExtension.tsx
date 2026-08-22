import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { stampTemplateButton } from "./templateButton";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    templateButton: {
      insertTemplateButton: (attrs?: { label?: string; kind?: string }) => ReturnType;
    };
  }
}

function TemplateButtonView({ node, editor, getPos }: NodeViewProps) {
  const label = (node.attrs.label as string) || "Insert";
  const editable = editor.isEditable;

  return (
    <NodeViewWrapper
      as="div"
      className="nw-template-button"
      data-type="template-button"
      data-kind={node.attrs.kind || "blocks"}
      contentEditable={false}
    >
      <button
        type="button"
        className="nw-template-button-trigger"
        data-testid="template-button"
        disabled={!editable}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const pos = typeof getPos === "function" ? getPos() : null;
          if (pos == null) return;
          stampTemplateButton(editor, pos);
        }}
      >
        {label}
      </button>
    </NodeViewWrapper>
  );
}

export const TemplateButton = Node.create({
  name: "templateButton",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      label: {
        default: "Insert",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-label") || "Insert",
        renderHTML: (attrs) => ({ "data-label": String(attrs.label || "Insert") }),
      },
      kind: {
        default: "blocks",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-kind") || "blocks",
        renderHTML: (attrs) => ({ "data-kind": String(attrs.kind || "blocks") }),
      },
      contentJson: {
        default: "[]",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-content") || "[]",
        renderHTML: (attrs) => ({ "data-content": String(attrs.contentJson || "[]") }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="template-button"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "template-button" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TemplateButtonView);
  },

  addCommands() {
    return {
      insertTemplateButton:
        (attrs = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              label: attrs.label || "Insert",
              kind: attrs.kind || "blocks",
              contentJson: "[]",
            },
          }),
    };
  },
});
