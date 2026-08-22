import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Dropcursor from "@tiptap/extension-dropcursor";
import Typography from "@tiptap/extension-typography";
import UniqueID from "@tiptap/extension-unique-id";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
import { FontFamily } from "@tiptap/extension-font-family";
import { Underline } from "@tiptap/extension-underline";
import { TrailingNode } from "./TrailingNodeExtension";
import { OutlineBlock } from "./OutlineBlock";
import { HeadingFold } from "./HeadingFoldExtension";
import { MarkdownInput } from "./MarkdownInputExtension";
import { FloatingImage } from "./FloatingImageExtension";
import { createSlashCommandExtension } from "./SlashCommandExtension";
import { Callout } from "./CalloutExtension";
import { ToggleBlock } from "./ToggleExtension";
import { BlockMath, InlineMath } from "./MathExtension";
import { ExcalidrawNode } from "./ExcalidrawExtension";
import { WritingExperience } from "./WritingExperienceExtension";
import { BlockHandle } from "./BlockHandleExtension";
import { BlockSelection } from "./BlockSelectionExtension";
import { CodeBlockExtension } from "./CodeBlockExtension";
import { Column, ColumnList } from "./ColumnExtension";
import { Bookmark } from "./BookmarkExtension";
import { Embed } from "./EmbedExtension";
import { createPageMentionExtension, type PageOption } from "./PageMentionExtension";
import { createWikiLinkExtension } from "./WikiLinkExtension";
import { createWikiEmbedExtension } from "./WikiEmbedExtension";
import { createPageEmbedExtension } from "./PageEmbedExtension";
import { createPageRefExtension } from "./PageRefExtension";
import { createFindReplaceExtension } from "./FindReplaceExtension";
import { createSelectionWrapExtension } from "./SelectionWrapExtension";
import type { PagePreview } from "./PageEmbedExtension";
import { Database } from "./DatabaseExtension";
import { SyncedBlock } from "./SyncedBlockExtension";
import type { Extensions } from "@tiptap/core";

interface BlockEditorExtensionHandlers {
  onImageUpload?: (file?: File) => void;
  onLinkPage?: () => void;
  onEmbedPage?: () => void;
  onNewPage?: (title: string) => void;
  onAskAI?: () => void;
  getPages?: () => PageOption[];
  getPagePreview?: (pageId: string) => PagePreview | null;
}

interface BlockEditorExtensionOptions extends BlockEditorExtensionHandlers {
  /** When true, disable local history (Yjs owns undo during collab). */
  collab?: boolean;
  /** Extra extensions (e.g. Collaboration + CollaborationCaret). */
  extraExtensions?: Extensions;
}

const PLACEHOLDER_BY_NODE: Record<string, string> = {
  heading: "Heading",
  blockquote: "Empty quote",
  bulletList: "List",
  orderedList: "List",
  taskList: "To-do",
  taskItem: "To-do",
  callout: "Callout",
  toggleBlock: "Toggle",
};

export function createBlockEditorExtensions(handlers: BlockEditorExtensionOptions = {}) {
  const { collab = false, extraExtensions = [] } = handlers;
  const resolvePages = () => handlers.getPages?.() ?? [];
  const createPage = handlers.onNewPage ? (title: string) => handlers.onNewPage?.(title) : undefined;
  const pageSuggestions =
    handlers.getPages != null
      ? [
          createPageMentionExtension(resolvePages, createPage),
          createWikiLinkExtension(resolvePages, createPage),
          createWikiEmbedExtension(resolvePages, createPage),
        ]
      : [];
  const pageRefExtension = createPageRefExtension(
    resolvePages,
    (pageId) => handlers.getPagePreview?.(pageId) ?? null,
  );
  const findReplaceExtension = createFindReplaceExtension(resolvePages);
  const pageEmbedExtension = createPageEmbedExtension(
    (pageId) => handlers.getPagePreview?.(pageId) ?? null,
  );

  return [
    WritingExperience,
    BlockSelection,
    BlockHandle,
    UniqueID.configure({
      types: [
        "paragraph", "heading", "blockquote", "codeBlock", "horizontalRule",
        "bulletList", "orderedList", "taskList", "listItem", "taskItem",
        "callout", "toggleBlock", "outlineBlock", "columnList", "column", "bookmark", "embed", "pageEmbed",
        "blockMath", "excalidraw", "database", "syncedBlock",
      ],
      attributeName: "id",
    }),
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      dropcursor: false,
      ...(collab ? { undoRedo: false as const } : {}),
      horizontalRule: {
        HTMLAttributes: { class: "editor-hr" },
      },
      link: false,
      underline: false,
      trailingNode: false,
    }),
    OutlineBlock,
    HeadingFold,
    CodeBlockExtension,
    Placeholder.configure({
      placeholder: ({ node, editor, pos }) => {
        if (node.type.name === "paragraph") {
          const doc = editor.state.doc;
          const isFirstTopLevel = pos === 0;
          const isOnlyBlock =
            doc.childCount === 1 && doc.firstChild?.type.name === "paragraph";
          if (isFirstTopLevel && isOnlyBlock) {
            return "Write, press '/' for commands, or '@' / '[[' for pages…";
          }
          return "";
        }
        if (node.type.name === "heading") {
          const level = (node.attrs as { level?: number }).level ?? 1;
          return `Heading ${level}`;
        }
        return PLACEHOLDER_BY_NODE[node.type.name] ?? "";
      },
      showOnlyWhenEditable: true,
      // Notion shows a hint on the block you are in, not on every empty block —
      // which also keeps each transaction from rebuilding decorations doc-wide.
      showOnlyCurrent: true,
      includeChildren: true,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    FloatingImage.configure({
      HTMLAttributes: { class: "editor-image" },
      allowBase64: true,
    }),
    Link.extend({
      parseHTML() {
        return [
          {
            tag: 'a[href]:not([href *= "javascript:" i]):not([href^="#page:"]):not([data-type="page-ref"])',
          },
        ];
      },
    }).configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: false,
      HTMLAttributes: { class: "editor-link" },
    }),
    Dropcursor.configure({ color: "hsl(var(--muted-foreground) / 0.4)", width: 2 }),
    Typography.configure({ emDash: false }),
    Table.configure({
      resizable: true,
      HTMLAttributes: { class: "editor-table" },
    }),
    TableRow,
    TableCell,
    TableHeader,
    Column,
    ColumnList,
    Callout,
    ToggleBlock,
    Bookmark,
    Embed,
    pageRefExtension,
    pageEmbedExtension,
    Database,
    SyncedBlock,
    BlockMath,
    InlineMath,
    ExcalidrawNode,
    TextStyle,
    Color,
    FontFamily,
    Underline,
    Highlight.configure({ multicolor: true }),
    MarkdownInput,
    findReplaceExtension,
    createSelectionWrapExtension({
      getPages: resolvePages,
      onNewPage: createPage,
    }),
    TrailingNode,
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
    createSlashCommandExtension({
      onImageUpload: () => handlers.onImageUpload?.(),
      onLinkPage: () => handlers.onLinkPage?.(),
      onEmbedPage: () => handlers.onEmbedPage?.(),
      onNewPage: (title: string) => handlers.onNewPage?.(title),
      onAskAI: () => handlers.onAskAI?.(),
    }),
    ...pageSuggestions,
    ...extraExtensions,
  ];
}
