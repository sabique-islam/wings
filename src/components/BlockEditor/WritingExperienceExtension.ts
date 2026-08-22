import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { turnInto, moveBlock, duplicateBlock, type TurnIntoType } from "./blockCommands";
import { caretPosAfterMerge, findTopLevelDepth } from "./blockUtils";
import { collapsedSiblings } from "./headingFold";
import { inlineContentSize, inlineTextOf, isInsideTable, liftCurrentBlock, nestCurrentBlock } from "./outlineNest";
import { openLinkHref } from "./editorLinkClick";
import { normalizeCodeLanguage } from "./codeLanguages";

// ─────────────────────────────────────────────────────────────────────────────
// WritingExperience — the "Notion-parity" keymap.
//
// Priority = 200: above StarterKit's node keymaps (100) so we get a first look
// at Enter/Backspace, but BELOW Suggestion plugins (500). Slash-menu keeps its
// Enter binding when its popup is open. This was the root cause of Enter being
// swallowed at priority 1000.
// ─────────────────────────────────────────────────────────────────────────────

function hasNode(editor: any, name: string): boolean {
  return Boolean(editor.state.schema.nodes[name]);
}

function currentTextBlock(editor: any) {
  const { selection } = editor.state;
  const { $from } = selection;
  if (!selection.empty || !$from.parent?.isTextblock) return null;
  const inlineSize = inlineContentSize($from.parent);
  return {
    node: $from.parent,
    text: inlineTextOf($from.parent),
    offset: $from.parentOffset,
    from: $from.start(),
    to: $from.start() + inlineSize,
    depth: $from.depth,
    typeName: $from.parent.type.name,
  };
}

function applyEnterMarkdownShortcut(editor: any): boolean {
  const block = currentTextBlock(editor);
  if (!block || block.offset !== block.text.length) return false;

  const text = block.text.trim();

  const codeFence = text.match(/^(```|~~~)([\w#+.+-]+)?$/);
  if (codeFence) {
    const language = normalizeCodeLanguage(codeFence[2] || null);
    let chain = editor.chain().deleteRange({ from: block.from, to: block.to });
    chain = language === "plaintext" ? chain.setCodeBlock() : chain.setCodeBlock({ language });
    return chain.run();
  }

  if (/^(---|___|\*\*\*)$/.test(text)) {
    return editor
      .chain()
      .deleteRange({ from: block.from, to: block.to })
      .setHorizontalRule()
      .run();
  }

  return false;
}

function convertEmptyDecorationToParagraph(editor: any): boolean {
  const block = currentTextBlock(editor);
  if (!block) return false;
  if (block.text.length !== 0) return false;
  const decorativeTypes = new Set(["heading", "blockquote", "callout"]);
  if (!decorativeTypes.has(block.typeName)) return false;
  return editor.chain().setParagraph().run();
}

function backspaceAtStartOfDecoration(editor: any): boolean {
  const { selection } = editor.state;
  if (!selection.empty) return false;
  const { $from } = selection;
  if ($from.parentOffset !== 0) return false;
  const decorativeTypes = new Set(["heading", "blockquote", "callout"]);
  if (!decorativeTypes.has($from.parent.type.name)) return false;
  return editor.chain().setParagraph().run();
}

const LIST_ITEM_TYPES = new Set(["listItem", "taskItem"]);
const LIST_WRAPPER_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

/** Walk ancestors — `$from.parent` is the inner paragraph, never the list item. */
function ancestorTypeName(
  $from: { depth: number; node: (depth: number) => { type: { name: string } } },
  types: Set<string>,
): string | null {
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (types.has(name)) return name;
  }
  return null;
}

/** Backspace on empty block merges/deletes upward (Notion merge-up). */
function mergeEmptyBlockUp(editor: any): boolean {
  const { state, view } = editor;
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;

  // List Backspace belongs to ListKeymap (priority 100). The caret sits in a
  // paragraph inside listItem, so findTopLevelDepth resolves to the list
  // wrapper — deleting that wipes every bullet.
  if (ancestorTypeName($from, LIST_ITEM_TYPES)) return false;

  const block = currentTextBlock(editor);
  if (!block || block.text.length !== 0 || block.offset !== 0) return false;

  const depth = findTopLevelDepth($from);
  if (depth < 1) return false;
  const indexInParent = $from.index(depth - 1);
  if (indexInParent === 0) return false;

  const blockPos = $from.before(depth);
  const blockNode = $from.node(depth);
  if (LIST_WRAPPER_TYPES.has(blockNode.type.name)) return false;

  const parent = $from.node(depth - 1);
  const prev = parent.child(indexInParent - 1);
  const prevPos = blockPos - prev.nodeSize;

  const tr = state.tr.delete(blockPos, blockPos + blockNode.nodeSize);
  const caretPos = caretPosAfterMerge(prevPos, prev, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(caretPos)));
  tr.scrollIntoView();
  view.dispatch(tr);
  return true;
}

function nestIntoPreviousSibling(editor: any): boolean {
  return nestCurrentBlock(editor);
}

/** Shift+Tab at block start — lift the current textblock out of a container. */
function liftOutOfContainer(editor: any): boolean {
  return liftCurrentBlock(editor);
}

/** Notion: Enter in a heading always leaves a paragraph, never another heading. */
function exitHeadingOnEnter(editor: any): boolean {
  const block = currentTextBlock(editor);
  if (!block || block.typeName !== "heading") return false;

  const { $from } = editor.state.selection;
  if (block.offset === block.text.length && $from.parent.attrs?.collapsed) {
    const headingPos = $from.before($from.depth);
    const range = collapsedSiblings(editor.state.doc, headingPos);
    const insertPos = range?.to ?? $from.after($from.depth);
    const paragraph = editor.state.schema.nodes.paragraph.create();
    const tr = editor.state.tr.insert(insertPos, paragraph);
    tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  }

  if (block.offset === block.text.length) {
    const after = $from.after($from.depth);
    const next = editor.state.doc.nodeAt(after);
    if (next?.type.name === "paragraph" && next.content.size === 0) {
      return editor.commands.setTextSelection(after + 1);
    }
  }

  if (!editor.commands.splitBlock({ keepMarks: true })) return false;
  return editor.chain().setParagraph().run();
}

/** Cmd+Enter — toggle todo, toggle block, or open page link. */
function modifyCurrentBlock(editor: any): boolean {
  const { state } = editor;
  const { $from, from } = state.selection;

  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === "heading") {
      return editor
        .chain()
        .focus()
        .updateAttributes("heading", { collapsed: !node.attrs.collapsed })
        .run();
    }
    if (node.type.name === "taskItem") {
      return editor
        .chain()
        .focus()
        .updateAttributes("taskItem", { checked: !node.attrs.checked })
        .run();
    }
    if (node.type.name === "toggleBlock") {
      const open = node.attrs.open !== false;
      return editor.chain().focus().updateAttributes("toggleBlock", { open: !open }).run();
    }
  }

  const marks = state.doc.resolve(from).marks();
  const link = marks.find((m) => m.type.name === "link");
  if (!link?.attrs.href) return false;
  return openLinkHref(link.attrs.href as string);
}

const TURN_INTO_KEYS: Record<string, TurnIntoType> = {
  "0": "paragraph",
  "1": "heading1",
  "2": "heading2",
  "3": "heading3",
  "4": "bulletList",
  "5": "orderedList",
  "6": "taskList",
  "7": "toggle",
  "8": "codeBlock",
};

export const WritingExperience = Extension.create({
  name: "writingExperience",
  priority: 200,

  addKeyboardShortcuts() {
    const enter = () => {
      if (!this.editor.isEditable) return false;
      if (applyEnterMarkdownShortcut(this.editor)) return true;
      if (convertEmptyDecorationToParagraph(this.editor)) return true;
      if (exitHeadingOnEnter(this.editor)) return true;
      return this.editor.commands.first(({ commands }) => [
        () => commands.newlineInCode(),
        () =>
          hasNode(this.editor, "taskItem")
            ? commands.splitListItem("taskItem")
            : false,
        () =>
          hasNode(this.editor, "listItem")
            ? commands.splitListItem("listItem")
            : false,
        () => commands.splitBlock({ keepMarks: true }),
      ]);
    };

    return {
      Enter: enter,
      "Shift-Enter": () =>
        this.editor.commands.first(({ commands }) => [
          () => commands.newlineInCode(),
          () => commands.setHardBreak(),
        ]),
      "Mod-Enter": () => modifyCurrentBlock(this.editor),

      Backspace: () =>
        backspaceAtStartOfDecoration(this.editor) ||
        mergeEmptyBlockUp(this.editor),

      Tab: () => {
        const { $from } = this.editor.state.selection;
        if (isInsideTable($from)) return false;
        if (this.editor.can().sinkListItem("listItem")) {
          return this.editor.chain().focus().sinkListItem("listItem").run();
        }
        if (this.editor.can().sinkListItem("taskItem")) {
          return this.editor.chain().focus().sinkListItem("taskItem").run();
        }
        nestIntoPreviousSibling(this.editor);
        return true;
      },
      "Shift-Tab": () => {
        const { $from } = this.editor.state.selection;
        if (isInsideTable($from)) return false;
        if (this.editor.can().liftListItem("listItem")) {
          return this.editor.chain().focus().liftListItem("listItem").run();
        }
        if (this.editor.can().liftListItem("taskItem")) {
          return this.editor.chain().focus().liftListItem("taskItem").run();
        }
        liftOutOfContainer(this.editor);
        return true;
      },

      "Mod-a": () => {
        const { selection, doc } = this.editor.state;
        const { $from } = selection;
        const depth = findTopLevelDepth($from);
        if (depth >= 1) {
          const from = $from.before(depth);
          const to = from + $from.node(depth).nodeSize;
          if (selection.from !== from || selection.to !== to) {
            const tr = this.editor.state.tr.setSelection(
              TextSelection.create(doc, from, Math.min(to, doc.content.size)),
            );
            this.editor.view.dispatch(tr);
            return true;
          }
        }
        return this.editor.commands.selectAll();
      },

      "Mod-Shift-ArrowUp": () => moveBlock(this.editor, "up"),
      "Mod-Shift-ArrowDown": () => moveBlock(this.editor, "down"),
      "Mod-d": () => duplicateBlock(this.editor),

      ...Object.fromEntries(
        Object.entries(TURN_INTO_KEYS).map(([key, type]) => [
          `Mod-Alt-${key}`,
          () => turnInto(this.editor, type),
        ]),
      ),
    };
  },
});
