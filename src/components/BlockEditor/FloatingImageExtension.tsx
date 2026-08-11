import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight, Maximize2 } from "@/lib/icons";
import { useCallback, useRef, useState } from "react";

const ALIGNMENTS = [
  { value: "left", label: "Align left", icon: AlignLeft },
  { value: "center", label: "Align center", icon: AlignCenter },
  { value: "right", label: "Align right", icon: AlignRight },
] as const;

const MIN_WIDTH = 120;

function ImageView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const { src, alt, width, align, caption } = node.attrs as {
    src: string;
    alt: string | null;
    width: string | null;
    align: string;
    caption: string;
  };
  const [dragging, setDragging] = useState(false);
  const figureRef = useRef<HTMLDivElement>(null);
  const editable = editor.isEditable;
  const showChrome = editable && (selected || dragging);

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = figureRef.current?.querySelector("img")?.clientWidth ?? MIN_WIDTH;
      setDragging(true);

      const onMove = (move: MouseEvent) => {
        const next = Math.max(MIN_WIDTH, Math.round(startWidth + (move.clientX - startX)));
        updateAttributes({ width: `${next}px` });
      };
      const onUp = () => {
        setDragging(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper
      className="editor-image-block"
      data-align={align}
      data-selected={selected ? "true" : undefined}
    >
      <div className="editor-image-figure" ref={figureRef} contentEditable={false}>
        <img src={src} alt={alt ?? caption ?? ""} style={width ? { width } : undefined} draggable={false} />
        {editable && (
          <span
            className="editor-image-resize"
            onMouseDown={startResize}
            role="presentation"
            title="Drag to resize"
          />
        )}
        {showChrome && (
          <div className="editor-image-toolbar">
            {ALIGNMENTS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                title={label}
                className={align === value ? "is-active" : undefined}
                onClick={() => updateAttributes({ align: value })}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
            <button type="button" title="Reset size" onClick={() => updateAttributes({ width: null })}>
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {(editable || caption) && (
        <input
          className="editor-image-caption"
          value={caption ?? ""}
          placeholder={editable ? "Write a caption…" : ""}
          readOnly={!editable}
          onChange={(event) => updateAttributes({ caption: event.target.value })}
          // The caption lives outside the document, so its keystrokes must not
          // reach the editor's own Enter and Backspace handling.
          onKeyDown={(event) => event.stopPropagation()}
        />
      )}
    </NodeViewWrapper>
  );
}

/** Image block with Notion-style align, width, and caption. */
export const FloatingImage = Image.extend({
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute("data-width"),
        renderHTML: (attrs) => (attrs.width ? { "data-width": attrs.width } : {}),
      },
      align: {
        default: "center" as string,
        parseHTML: (el) => el.getAttribute("data-align") || "center",
        renderHTML: (attrs) => ({ "data-align": attrs.align }),
      },
      caption: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-caption") || "",
        renderHTML: (attrs) => (attrs.caption ? { "data-caption": attrs.caption } : {}),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});
