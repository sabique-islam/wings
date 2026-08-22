import { Node, mergeAttributes } from "@tiptap/core";
import { bindColumnResize } from "./columnResize";
import { columnTemplateCss, parseColumnWidths, serializeColumnWidths } from "./columnWidths";

export type ColumnCount = 2 | 3 | 4 | 5;

export function clampColumnCount(count?: number): ColumnCount {
  if (!count || count <= 2) return 2;
  if (count >= 5) return 5;
  return count as ColumnCount;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columnList: {
      insertColumnList: (count?: number) => ReturnType;
    };
  }
}

function paintColumnList(dom: HTMLElement, node: { childCount: number; attrs: Record<string, unknown> }) {
  const count = Math.max(node.childCount, 1);
  const cols = clampColumnCount(count);
  const widths = parseColumnWidths(node.attrs.widths, count);
  dom.className = `nw-column-list nw-cols-${cols}`;
  dom.setAttribute("data-type", "column-list");
  dom.setAttribute("data-cols", String(cols));
  if (node.attrs.id) dom.setAttribute("id", String(node.attrs.id));
  else dom.removeAttribute("id");
  if (node.attrs.widths) dom.setAttribute("data-widths", serializeColumnWidths(widths));
  else dom.removeAttribute("data-widths");
  dom.style.setProperty("--nw-col-template", columnTemplateCss(widths));
}

export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column", class: "nw-col" }), 0];
  },

  addNodeView() {
    return ({ editor, getPos, node }) => {
      const dom = document.createElement("div");
      dom.className = "nw-col";
      dom.setAttribute("data-type", "column");
      if (node.attrs.id) dom.setAttribute("id", String(node.attrs.id));

      const contentDOM = document.createElement("div");
      contentDOM.className = "nw-col-content";
      dom.appendChild(contentDOM);

      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "nw-col-gap";
      handle.tabIndex = -1;
      handle.setAttribute("contenteditable", "false");
      handle.setAttribute("aria-label", "Resize columns");
      handle.setAttribute("title", "Drag to resize · Double-click to reset");
      dom.appendChild(handle);

      const unbind = bindColumnResize(handle, editor, getPos);

      return {
        dom,
        contentDOM,
        update(updated) {
          if (updated.type.name !== "column") return false;
          if (updated.attrs.id) dom.setAttribute("id", String(updated.attrs.id));
          else dom.removeAttribute("id");
          return true;
        },
        ignoreMutation: (mutation) => handle.contains(mutation.target as globalThis.Node),
        stopEvent: (event) => handle.contains(event.target as globalThis.Node),
        destroy: unbind,
      };
    };
  },
});

export const ColumnList = Node.create({
  name: "columnList",
  group: "block",
  content: "column+",
  defining: true,

  addAttributes() {
    return {
      cols: {
        default: 2,
        parseHTML: (el) => clampColumnCount(parseInt(el.getAttribute("data-cols") || "2", 10)),
        renderHTML: (attrs) => ({ "data-cols": String(clampColumnCount(Number(attrs.cols))) }),
      },
      widths: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-widths");
          if (!raw) return null;
          const parts = raw.split(",").map((part) => Number(part.trim()));
          if (!parts.length || parts.some((value) => !Number.isFinite(value) || value <= 0)) return null;
          return parts;
        },
        renderHTML: (attrs) => {
          if (!attrs.widths) return {};
          if (typeof attrs.widths === "string") return { "data-widths": attrs.widths };
          if (Array.isArray(attrs.widths)) {
            const parts = attrs.widths.map(Number);
            if (!parts.every((value) => Number.isFinite(value) && value > 0)) return {};
            return { "data-widths": serializeColumnWidths(parts) };
          }
          return {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column-list"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const cols = HTMLAttributes["data-cols"] || "2";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "column-list",
        "data-cols": cols,
        class: `nw-column-list nw-cols-${cols}`,
      }),
      0,
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      paintColumnList(dom, node);
      return {
        dom,
        contentDOM: dom,
        update(updated) {
          if (updated.type.name !== "columnList") return false;
          paintColumnList(dom, updated);
          return true;
        },
        ignoreMutation: (mutation) =>
          mutation.type === "attributes" &&
          (mutation.attributeName === "style" ||
            mutation.attributeName === "class" ||
            mutation.attributeName === "data-widths" ||
            mutation.attributeName === "data-cols"),
      };
    };
  },

  addCommands() {
    return {
      insertColumnList:
        (count = 2) =>
        ({ commands }) => {
          const n = clampColumnCount(count);
          const cols = Array.from({ length: n }, () => ({
            type: "column",
            content: [{ type: "paragraph" }],
          }));
          return commands.insertContent({ type: this.name, attrs: { cols: n }, content: cols });
        },
    };
  },
});
