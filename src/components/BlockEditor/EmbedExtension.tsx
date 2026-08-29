import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { isAllowedEmbedUrl, isSafeHttpUrl } from "@/lib/safeUrl";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embed: {
      insertEmbed: (attrs: { url: string; embedUrl: string }) => ReturnType;
    };
  }
}

function EmbedView({ node, selected, getPos, editor }: NodeViewProps) {
  const { embedUrl, url } = node.attrs as { embedUrl: string; url: string };
  const src = embedUrl || url;

  const selectCard = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof pos !== "number") return;
    editor.chain().focus().setNodeSelection(pos).run();
  };

  if (!isAllowedEmbedUrl(src)) {
    return (
      <NodeViewWrapper className="embed-block" data-type="embed">
        <div
          className={`embed-fallback${selected ? " is-selected" : ""}`}
          contentEditable={false}
          onClick={selectCard}
        >
          {isSafeHttpUrl(url) ? (
            <a href={url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
              {url}
            </a>
          ) : (
            <span>Embed blocked (untrusted source)</span>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="embed-block" data-type="embed">
      <div
        className={`embed-frame${selected ? " is-selected" : ""}`}
        contentEditable={false}
        data-testid="embed-card"
      >
        {!selected ? <button type="button" className="embed-hit" aria-label="Select embed" onClick={selectCard} /> : null}
        <iframe
          src={src}
          title="Embed"
          frameBorder="0"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
          referrerPolicy="no-referrer"
          className="embed-iframe"
        />
      </div>
    </NodeViewWrapper>
  );
}

export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url: {
        default: "",
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-url") || (el as HTMLElement).getAttribute("url") || "",
        renderHTML: (attrs) => (attrs.url ? { "data-url": attrs.url } : {}),
      },
      embedUrl: {
        default: "",
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-embed-url") ||
          (el as HTMLElement).getAttribute("embedurl") ||
          (el as HTMLElement).getAttribute("embedUrl") ||
          "",
        renderHTML: (attrs) => (attrs.embedUrl ? { "data-embed-url": attrs.embedUrl } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "embed" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedView);
  },

  addCommands() {
    return {
      insertEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
