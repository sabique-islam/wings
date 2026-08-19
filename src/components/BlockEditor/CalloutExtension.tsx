import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, NodeViewProps } from "@tiptap/react";
import { useState } from "react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: { emoji?: string; bgColor?: string }) => ReturnType;
      toggleCallout: () => ReturnType;
    };
  }
}

const CALLOUT_COLORS = [
  { label: "Default", value: "" },
  { label: "Gray", value: "rgba(241,241,239,0.5)" },
  { label: "Blue", value: "rgba(231,243,248,0.6)" },
  { label: "Green", value: "rgba(237,243,236,0.6)" },
  { label: "Yellow", value: "rgba(251,243,219,0.6)" },
  { label: "Red", value: "rgba(253,235,236,0.6)" },
];

const ALLOWED_BG_COLORS = new Set(CALLOUT_COLORS.map((c) => c.value).filter(Boolean));

const EMOJI_OPTIONS = ["💡", "⚠️", "✅", "❌", "📌", "🔥", "💬", "📝", "🎯", "⭐"];

function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const emoji = (node.attrs.emoji as string) || "💡";
  const rawBg = (node.attrs.bgColor as string) || "";
  const bgColor = ALLOWED_BG_COLORS.has(rawBg) ? rawBg : "";
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <NodeViewWrapper
      className="callout-block"
      data-type="callout"
      data-emoji={emoji}
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      <div className="relative" contentEditable={false}>
        <button
          type="button"
          className="callout-emoji"
          onClick={() => setPickerOpen((o) => !o)}
        >
          {emoji}
        </button>
        {pickerOpen && (
          <div className="callout-emoji-picker absolute left-0 top-full z-20 flex flex-wrap gap-1 p-2 rounded-md border border-border bg-popover shadow-md">
            {EMOJI_OPTIONS.map((em) => (
              <button
                key={em}
                type="button"
                className="text-lg p-1 rounded hover:bg-muted"
                onClick={() => {
                  updateAttributes({ emoji: em });
                  setPickerOpen(false);
                }}
              >
                {em}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="callout-content">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      emoji: {
        default: "💡",
        parseHTML: (el) => el.getAttribute("data-emoji") || "💡",
        renderHTML: (attrs) => ({ "data-emoji": attrs.emoji }),
      },
      bgColor: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-bg-color") || "",
        renderHTML: (attrs) => (attrs.bgColor ? { "data-bg-color": attrs.bgColor } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout", class: "callout-block" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ state, commands }) => {
          const next = { emoji: attrs?.emoji ?? "💡", bgColor: attrs?.bgColor ?? "" };
          const { $from } = state.selection;
          if (!$from.parent?.isTextblock) {
            return commands.insertContent({
              type: this.name,
              attrs: next,
              content: [{ type: "paragraph" }],
            });
          }
          const from = $from.before($from.depth);
          const to = from + $from.parent.nodeSize;
          return commands.insertContentAt(
            { from, to },
            { type: this.name, attrs: next, content: [$from.parent.toJSON()] },
          );
        },
      toggleCallout:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
    };
  },
});

export { CALLOUT_COLORS };
