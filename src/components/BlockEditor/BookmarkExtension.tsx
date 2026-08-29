import { useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { ExternalLink } from "@/lib/icons";
import { fetchLinkPreview } from "@/lib/linkPreview";
import { isSafeHttpUrl } from "@/lib/safeUrl";
import { bookmarkNeedsPreview, updateBookmarkMeta } from "./blockCommands";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    bookmark: {
      insertBookmark: (attrs: {
        url: string;
        title?: string;
        description?: string;
        image?: string;
        favicon?: string;
        style?: string;
      }) => ReturnType;
    };
  }
}

type BookmarkStyle = "horizontal" | "list";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function dataAttr(
  name: string,
  parseLegacy?: string,
): {
  default: string;
  parseHTML: (el: HTMLElement) => string;
  renderHTML: (attrs: Record<string, unknown>) => Record<string, string>;
} {
  return {
    default: "",
    parseHTML: (el) => {
      const html = el as HTMLElement;
      return (
        html.getAttribute(`data-${name}`) ||
        html.getAttribute(name) ||
        (parseLegacy ? html.getAttribute(parseLegacy) : null) ||
        ""
      );
    },
    renderHTML: (attrs) => {
      const value = String(attrs[name] ?? "");
      return value ? { [`data-${name}`]: value } : {};
    },
  };
}

function BookmarkView({ node, selected, getPos, editor }: NodeViewProps) {
  const { url, title, description, image, favicon, style } = node.attrs as {
    url: string;
    title: string;
    description: string;
    image: string;
    favicon: string;
    style: string;
  };
  const [status, setStatus] = useState<"ready" | "loading" | "error">("ready");
  const safe = isSafeHttpUrl(url);
  const host = hostnameOf(url);
  const cardStyle: BookmarkStyle = style === "list" ? "list" : "horizontal";
  const previewImage = image && isSafeHttpUrl(image) ? image : "";
  const icon = favicon && isSafeHttpUrl(favicon) ? favicon : "";
  const displayTitle = status === "loading" ? "Loading..." : title || host || "Link card";
  const displayDesc =
    status === "loading"
      ? ""
      : status === "error"
        ? "Failed to retrieve link information."
        : description || "";

  useEffect(() => {
    if (!editor.isEditable || !safe) return;
    if (!bookmarkNeedsPreview({ url, title, description, image })) return;
    let cancelled = false;
    setStatus("loading");
    void fetchLinkPreview(url).then((meta) => {
      if (cancelled) return;
      if (!meta) {
        setStatus("error");
        return;
      }
      const pos = typeof getPos === "function" ? getPos() : undefined;
      if (typeof pos !== "number") return;
      const current = editor.state.doc.nodeAt(pos);
      if (!current || current.type.name !== "bookmark" || current.attrs.url !== url) return;
      updateBookmarkMeta(editor, url, meta);
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
    // Fetch once per URL; attrs update after the patch and must not retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const selectCard = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof pos !== "number") return;
    editor.chain().focus().setNodeSelection(pos).run();
  };

  const openUrl = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!safe) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <NodeViewWrapper className="bookmark-block" data-type="bookmark">
      <div
        className={`bookmark-card ${cardStyle}${selected ? " is-selected" : ""}${status === "loading" ? " is-loading" : ""}${status === "error" ? " is-error" : ""}`}
        contentEditable={false}
        data-testid="link-card"
        onClick={selectCard}
        onDoubleClick={openUrl}
      >
        <div className="bookmark-body">
          <div className="bookmark-title-row">
            {icon ? <img src={icon} alt="" className="bookmark-favicon" /> : null}
            <p className="bookmark-title">{displayTitle}</p>
          </div>
          {displayDesc ? <p className="bookmark-desc">{displayDesc}</p> : null}
          <button type="button" className="bookmark-url" onClick={openUrl} title={url}>
            <span>{host || url}</span>
            <ExternalLink className="bookmark-url-icon h-3 w-3 shrink-0" />
          </button>
        </div>
        {cardStyle === "horizontal" ? (
          previewImage ? (
            <img src={previewImage} alt="" className="bookmark-image" />
          ) : (
            <div className="bookmark-banner-fallback" aria-hidden="true" />
          )
        ) : null}
      </div>
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
      url: dataAttr("url"),
      title: dataAttr("title"),
      description: dataAttr("description"),
      image: dataAttr("image"),
      favicon: dataAttr("favicon"),
      style: {
        default: "horizontal",
        parseHTML: (el) => {
          const value = (el as HTMLElement).getAttribute("data-style");
          return value === "list" ? "list" : "horizontal";
        },
        renderHTML: (attrs) =>
          attrs.style && attrs.style !== "horizontal" ? { "data-style": String(attrs.style) } : {},
      },
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
