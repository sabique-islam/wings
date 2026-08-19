import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, NodeViewProps } from "@tiptap/react";
import { ChevronRight } from "@/lib/icons";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    toggleBlock: {
      setToggleBlock: () => ReturnType;
    };
  }
}

function ToggleView({ node, updateAttributes }: NodeViewProps) {
  const open = node.attrs.open !== false;
  const summary = (node.attrs.summary as string) || "Toggle";

  const toggleOpen = () => updateAttributes({ open: !open });

  return (
    <NodeViewWrapper
      className="toggle-block"
      data-type="toggle"
      data-open={open ? "true" : "false"}
      data-summary={summary}
    >
      <div className="toggle-header">
        <button type="button" className="toggle-chevron" onClick={toggleOpen} contentEditable={false}>
          <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <span
          className="toggle-summary"
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => updateAttributes({ summary: e.currentTarget.textContent || "Toggle" })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const contentEl = (e.currentTarget.closest(".toggle-block") as HTMLElement)?.querySelector(
                ".toggle-content .ProseMirror, .toggle-content [contenteditable]",
              ) as HTMLElement | null;
              contentEl?.focus();
            }
          }}
        >
          {summary}
        </span>
      </div>
      {open && (
        <div className="toggle-content">
          <NodeViewContent />
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const ToggleBlock = Node.create({
  name: "toggleBlock",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-open") !== "false",
        renderHTML: (attrs) => ({ "data-open": attrs.open ? "true" : "false" }),
      },
      summary: {
        default: "Toggle",
        parseHTML: (el) => el.getAttribute("data-summary") || "Toggle",
        renderHTML: (attrs) => ({ "data-summary": attrs.summary }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "toggle", class: "toggle-block" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },

  addCommands() {
    return {
      setToggleBlock:
        () =>
        ({ state, commands }) => {
          const attrs = { open: true, summary: "Toggle" };
          const { $from } = state.selection;
          if (!$from.parent?.isTextblock) {
            return commands.insertContent({
              type: this.name,
              attrs,
              content: [{ type: "paragraph" }],
            });
          }
          const from = $from.before($from.depth);
          const to = from + $from.parent.nodeSize;
          return commands.insertContentAt(
            { from, to },
            { type: this.name, attrs, content: [$from.parent.toJSON()] },
          );
        },
    };
  },
});
