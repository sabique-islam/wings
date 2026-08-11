import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { ExternalLink } from "@/lib/icons";
import { isSafeHttpUrl } from "@/lib/safeUrl";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    bookmark: {
      insertBookmark: (attrs: {
        url: string;
        title?: string;
        description?: string;
        image?: string;
        favicon?: string;
      }) => ReturnType;
    };
  }
}

function BookmarkView({ node }: NodeViewProps) {
  const { url, title, description, image, favicon } = node.attrs as {
    url: string;
    title: string;
    description: string;
    image: string;
    favicon: string;
  };
  const safe = isSafeHttpUrl(url);
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  const displayTitle = title || host;
  const previewImage = image && isSafeHttpUrl(image) ? image : "";
  const icon = favicon && isSafeHttpUrl(favicon) ? favicon : "";

  return (
    <NodeViewWrapper className="bookmark-block" data-type="bookmark">
      <a
        href={safe ? url : undefined}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="bookmark-card"
        contentEditable={false}
      >
        <div className="bookmark-body">
          <div className="bookmark-title-row">
            {icon ? (
              <img src={icon} alt="" className="bookmark-favicon" />
            ) : null}
            <p className="bookmark-title">{displayTitle}</p>
          </div>
          {description ? <p className="bookmark-desc">{description}</p> : null}
          {url ? <p className="bookmark-url">{url}</p> : null}
        </div>
        {previewImage ? (
          <img src={previewImage} alt="" className="bookmark-image" />
        ) : (
          <ExternalLink className="bookmark-icon h-4 w-4 shrink-0" />
        )}
      </a>
    </NodeViewWrapper>
  );
}

export const Bookmark = Node.create({
  name: "bookmark",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url: { default: "" },
      title: { default: "" },
      description: { default: "" },
      image: { default: "" },
      favicon: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="bookmark"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "bookmark" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookmarkView);
  },

  addCommands() {
    return {
      insertBookmark:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
