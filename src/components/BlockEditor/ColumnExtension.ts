import { Node, mergeAttributes } from "@tiptap/core";

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
