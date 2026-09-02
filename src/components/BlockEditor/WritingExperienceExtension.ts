import { Extension } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { turnInto, moveBlock, duplicateBlock, type TurnIntoType } from "./blockCommands";
import { findColumnDepth, findTopLevelDepth, findWeekCardDepth, selectionCoveringNode } from "./blockUtils";
import { indentCurrentBlock, isInsideTable, outdentCurrentBlock } from "./outlineNest";
import { openLinkHref } from "./editorLinkClick";
import {
  addParagraphAfterHeading,
  addParagraphAfterOutlineTitle,
  applyEnterMarkdownShortcut,
  convertEmptyDecorationToParagraph,
  hasNode,
  mergeEmptyBlockUp,
} from "./writingKeys";

// ─────────────────────────────────────────────────────────────────────────────
// WritingExperience — typing keymap.
//
// Priority = 200: above StarterKit's node keymaps (100) so we get a first look
// at Enter/Backspace, but BELOW Suggestion plugins (500). Slash-menu keeps its
// Enter binding when its popup is open. This was the root cause of Enter being
// swallowed at priority 1000.
// ─────────────────────────────────────────────────────────────────────────────

const CARD_NODE_TYPES = new Set(["bookmark", "embed"]);

function selectedCardNode(editor: any): { from: number; to: number } | null {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return null;
  if (!CARD_NODE_TYPES.has(selection.node.type.name)) return null;
  return { from: selection.from, to: selection.to };
}

function enterAfterSelectedCard(editor: any): boolean {
  const card = selectedCardNode(editor);
  if (!card) return false;
  const paragraph = editor.state.schema.nodes.paragraph.create();
  const tr = editor.state.tr.insert(card.to, paragraph);
  tr.setSelection(TextSelection.near(tr.doc.resolve(card.to + 1)));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

function deleteSelectedCardNode(editor: any): boolean {
  if (!selectedCardNode(editor)) return false;
  return editor.commands.deleteSelection();
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
  const link = marks.find((m: { type: { name: string }; attrs: { href?: string } }) => m.type.name === "link");
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
      if (enterAfterSelectedCard(this.editor)) return true;
      if (applyEnterMarkdownShortcut(this.editor)) return true;
      if (convertEmptyDecorationToParagraph(this.editor)) return true;
      if (addParagraphAfterHeading(this.editor)) return true;
      if (addParagraphAfterOutlineTitle(this.editor)) return true;
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
        deleteSelectedCardNode(this.editor) ||
        backspaceAtStartOfDecoration(this.editor) ||
        mergeEmptyBlockUp(this.editor),
      Delete: () => deleteSelectedCardNode(this.editor),

      Tab: () => {
        if (isInsideTable(this.editor.state.selection.$from)) return false;
        return indentCurrentBlock(this.editor);
      },
      "Shift-Tab": () => {
        if (isInsideTable(this.editor.state.selection.$from)) return false;
        return outdentCurrentBlock(this.editor);
      },

      "Mod-a": () => {
        const { selection, doc } = this.editor.state;
        const { $from } = selection;
        const depths = [findColumnDepth($from), findWeekCardDepth($from), findTopLevelDepth($from)].filter(
          (depth): depth is number => depth != null && depth >= 1,
        );
        const seen = new Set<number>();
        for (const depth of depths) {
          if (seen.has(depth)) continue;
          seen.add(depth);
          const pos = $from.before(depth);
          const next = selectionCoveringNode(doc, pos, $from.node(depth));
          if (selection.from !== next.from || selection.to !== next.to) {
            this.editor.view.dispatch(this.editor.state.tr.setSelection(next));
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
