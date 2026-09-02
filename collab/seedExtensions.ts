/**
 * Minimal TipTap extensions for server-side Y.Doc seeding.
 * Schema stubs match custom node names in content_json (no React node views).
 */
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import type { Extensions } from "@tiptap/core";

function stubBlock(name: string, content = "block*") {
  return Node.create({
    name,
    group: "block",
    content,
    defining: true,
    parseHTML: () => [{ tag: `div[data-type="${name}"]` }],
    renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes({ "data-type": name }, HTMLAttributes), 0],
  });
}

function stubInline(name: string) {
  return Node.create({
    name,
    group: "inline",
    inline: true,
    atom: true,
    parseHTML: () => [{ tag: `span[data-type="${name}"]` }],
    renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes({ "data-type": name }, HTMLAttributes)],
  });
}

/** Extensions for TiptapTransformer.toYdoc — must cover node types in stored content_json. */
export function getSeedExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      dropcursor: false,
      link: false,
    }),
    Link.configure({ openOnClick: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    Image.configure({ inline: false, allowBase64: true }),
    stubBlock("callout", "block+"),
    stubBlock("toggleBlock", "block+"),
    stubBlock("bookmark"),
    stubBlock("embed"),
    stubBlock("column", "block+"),
    stubBlock("weekCard", "block+"),
    Node.create({
      name: "templateButton",
      group: "block",
      atom: true,
      parseHTML: () => [{ tag: 'div[data-type="template-button"]' }],
      renderHTML: ({ HTMLAttributes }) => [
        "div",
        mergeAttributes({ "data-type": "template-button" }, HTMLAttributes),
      ],
    }),
    Node.create({
      name: "columnList",
      group: "block",
      content: "column+",
      defining: true,
      addAttributes() {
        return {
          cols: { default: 2 },
          widths: { default: null },
        };
      },
      parseHTML: () => [{ tag: 'div[data-type="column-list"]' }],
      renderHTML: ({ HTMLAttributes }) => [
        "div",
        mergeAttributes({ "data-type": "column-list" }, HTMLAttributes),
        0,
      ],
    }),
    stubBlock("blockMath"),
    stubBlock("excalidrawDrawing"),
    stubBlock("database"),
    stubBlock("syncedBlock", "block+"),
    stubBlock("pageEmbed"),
    stubInline("inlineMath"),
    // codeBlockLowlight name on client
    Node.create({
      name: "codeBlock",
      group: "block",
      content: "text*",
      marks: "",
      code: true,
      defining: true,
      parseHTML: () => [{ tag: "pre" }],
      renderHTML: () => ["pre", ["code", 0]],
    }),
  ];
}
