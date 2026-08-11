import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { useState, useRef, useCallback, useEffect } from "react";
import { AlignLeft, AlignCenter, AlignRight, Pencil, Trash2 } from "@/lib/icons";
import { loadScene } from "@/lib/drawingStore";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    excalidraw: {
      insertDrawing: (opts: { sceneId: string; imageUrl: string | null }) => ReturnType;
    };
  }
}

function DrawingNodeView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const { sceneId, imageUrl, width, align } = node.attrs as {
    sceneId: string; imageUrl: string | null; width: number; align: "left" | "center" | "right";
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const editable = editor.isEditable;

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    const startX = e.clientX;
    const startW = width || 600;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      updateAttributes({ width: Math.round(Math.max(160, Math.min(1400, startW + dx))) });
    };
    const onUp = () => {
      setResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [width, updateAttributes, editable]);

  const openEditor = useCallback(() => {
    window.dispatchEvent(new CustomEvent("nw:editDrawing", { detail: { sceneId } }));
  }, [sceneId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as { sceneId: string; imageUrl: string | null };
      if (d.sceneId === sceneId && d.imageUrl) updateAttributes({ imageUrl: d.imageUrl });
    };
    window.addEventListener("nw:drawingUpdated", handler as any);
    return () => window.removeEventListener("nw:drawingUpdated", handler as any);
  }, [sceneId, updateAttributes]);

  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

  return (
    <NodeViewWrapper as="div" className="nw-drawing-node" data-drag-handle>
      <div style={{ display: "flex", justifyContent: justify, margin: "1rem 0" }}>
        <div
          ref={containerRef}
          className="relative group"
          style={{ width: Math.min(width || 720, 1400) }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="drawing"
              draggable={false}
              className="block w-full h-auto rounded-md border border-border select-none"
            />
          ) : (
            <div className="w-full min-h-[120px] rounded-md border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground bg-secondary/30">
              ✏️ drawing · click ✎ to edit
            </div>
          )}

          {editable && (
            <>
              <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-card/90 backdrop-blur border border-border rounded-md p-0.5 shadow-sm">
                <button onClick={() => updateAttributes({ align: "left" })} title="Align left" className={`nw-tb-btn ${align === "left" ? "active" : ""}`}><AlignLeft className="h-3 w-3" /></button>
                <button onClick={() => updateAttributes({ align: "center" })} title="Center" className={`nw-tb-btn ${align === "center" ? "active" : ""}`}><AlignCenter className="h-3 w-3" /></button>
                <button onClick={() => updateAttributes({ align: "right" })} title="Align right" className={`nw-tb-btn ${align === "right" ? "active" : ""}`}><AlignRight className="h-3 w-3" /></button>
                <span className="w-px bg-border mx-0.5" />
                <button onClick={openEditor} title="Edit drawing" className="nw-tb-btn"><Pencil className="h-3 w-3" /></button>
                <button onClick={() => deleteNode()} title="Remove" className="nw-tb-btn hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
              </div>
              <div
                onMouseDown={onResizeStart}
                className={`absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-12 rounded-full bg-primary/40 hover:bg-primary cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity ${resizing ? "opacity-100" : ""}`}
                title="Drag to resize"
              />
            </>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const ExcalidrawNode = Node.create({
  name: "excalidrawDrawing",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      sceneId: { default: "" },
      imageUrl: { default: null },
      width: { default: 720 },
      align: { default: "center" as const },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='excalidraw']",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          return {
            sceneId: e.getAttribute("data-scene-id") || "",
            imageUrl: e.getAttribute("data-image-url") || null,
            width: parseInt(e.getAttribute("data-width") || "720", 10),
            align: (e.getAttribute("data-align") as any) || "center",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "excalidraw",
        "data-scene-id": node.attrs.sceneId,
        "data-image-url": node.attrs.imageUrl ?? "",
        "data-width": String(node.attrs.width),
        "data-align": node.attrs.align,
      }),
      node.attrs.imageUrl
        ? ["img", { src: node.attrs.imageUrl, alt: "drawing" }]
        : ["span", {}, "[drawing]"],
    ];
  },

  addCommands() {
    return {
      insertDrawing:
        (opts) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { sceneId: opts.sceneId, imageUrl: opts.imageUrl, width: 720, align: "center" },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawingNodeView);
  },
});

export function ensureScene(sceneId: string) {
  return loadScene(sceneId);
}
