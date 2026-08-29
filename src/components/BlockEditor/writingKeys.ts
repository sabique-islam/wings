import { TextSelection } from "@tiptap/pm/state";
import { caretPosAfterMerge, findColumnDepth } from "./blockUtils";
import { collapsedSiblings } from "./headingFold";
import { inlineContentSize, inlineTextOf } from "./outlineNest";
import { matchCodeFenceMarkup, isHorizontalRuleMarkup } from "./markdownInput";
import { normalizeCodeLanguage } from "./codeLanguages";

function hasNode(editor: { state: { schema: { nodes: Record<string, unknown> } } }, name: string): boolean {
  return Boolean(editor.state.schema.nodes[name]);
}

export function currentTextBlock(editor: {
  state: { selection: { empty: boolean; $from: any } };
}) {
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
    typeName: $from.parent.type.name as string,
  };
}

/** Fence / HR on Enter — same markup as the space input rules. */
export function applyEnterMarkdownShortcut(editor: any): boolean {
  const block = currentTextBlock(editor);
  if (!block || block.offset !== block.text.length) return false;

  const fence = matchCodeFenceMarkup(block.text);
  if (fence) {
    const language = normalizeCodeLanguage(fence.language || null);
    let chain = editor.chain().deleteRange({ from: block.from, to: block.to });
    chain = language === "plaintext" ? chain.setCodeBlock() : chain.setCodeBlock({ language });
    return chain.run();
  }

  if (isHorizontalRuleMarkup(block.text)) {
    return editor.chain().deleteRange({ from: block.from, to: block.to }).setHorizontalRule().run();
  }

  return false;
}

const LIST_ITEM_TYPES = new Set(["listItem", "taskItem"]);
const LIST_WRAPPER_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

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

function endOfLastTextblock(pos: number, node: {
  isTextblock: boolean;
  childCount: number;
  lastChild: unknown;
  content: { size: number };
  nodeSize: number;
}): number {
  if (node.isTextblock) return pos + 1 + node.content.size;
  if (!node.childCount || !node.lastChild) return pos + node.nodeSize;
  const last = node.lastChild as typeof node;
  const lastPos = pos + node.nodeSize - 1 - last.nodeSize;
  return endOfLastTextblock(lastPos, last);
}

/** First empty block in a later column: land in the previous column. First column stays put. */
function moveCaretToPreviousColumn(editor: any): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  const columnDepth = findColumnDepth($from);
  if (columnDepth == null) return false;
  const listDepth = columnDepth - 1;
  if (listDepth < 1) return false;
  const list = $from.node(listDepth);
  if (list.type.name !== "columnList") return false;
  const colIndex = $from.index(listDepth);
  if (colIndex < 1) return false;

  const prevCol = list.child(colIndex - 1);
  const colPos = $from.before(columnDepth);
  const prevColPos = colPos - prevCol.nodeSize;
  const caret = Math.min(endOfLastTextblock(prevColPos, prevCol), state.doc.content.size);
  const tr = state.tr.setSelection(TextSelection.near(state.doc.resolve(caret)));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** Backspace on empty block merges/deletes upward. */
export function mergeEmptyBlockUp(editor: any): boolean {
  const { state, view } = editor;
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;

  // List Backspace belongs to ListKeymap (priority 100). Deleting the list
  // wrapper from here used to wipe every bullet.
  if (ancestorTypeName($from, LIST_ITEM_TYPES)) return false;

  const block = currentTextBlock(editor);
  if (!block || block.text.length !== 0 || block.offset !== 0) return false;

  const depth = $from.depth;
  if (depth < 1) return false;

  const parent = $from.node(depth - 1);
  const indexInParent = $from.index(depth - 1);
  if (indexInParent === 0) {
    if (parent.type.name === "doc") return false;
    // Isolating columns: never selectNodeBackward (that deletes the week row).
    if (parent.type.spec?.isolating || parent.type.name === "column") {
      moveCaretToPreviousColumn(editor);
      return true;
    }
    return false;
  }

  const blockPos = $from.before(depth);
  const blockNode = $from.parent;
  if (LIST_WRAPPER_TYPES.has(blockNode.type.name)) return false;

  const prev = parent.child(indexInParent - 1);
  const prevPos = blockPos - prev.nodeSize;

  const tr = state.tr.delete(blockPos, blockPos + blockNode.nodeSize);
  const caretPos = caretPosAfterMerge(prevPos, prev, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(caretPos)));
  tr.scrollIntoView();
  view.dispatch(tr);
  return true;
}

function insertOrReuseParagraphAfter(editor: any, insertPos: number): boolean {
  const next = editor.state.doc.nodeAt(insertPos);
  if (next?.type.name === "paragraph" && next.content.size === 0) {
    return editor.commands.setTextSelection(insertPos + 1);
  }
  const paragraph = editor.state.schema.nodes.paragraph.create();
  const tr = editor.state.tr.insert(insertPos, paragraph);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

function paragraphAfterCollapsedHeading(editor: any, block: NonNullable<ReturnType<typeof currentTextBlock>>): boolean {
  const { $from } = editor.state.selection;
  const headingPos = $from.before($from.depth);
  const range = collapsedSiblings(editor.state.doc, headingPos);
  const insertPos = range?.to ?? $from.after($from.depth);
  const atEnd = block.offset === block.text.length;
  const right = atEnd ? "" : block.text.slice(block.offset);

  let tr = editor.state.tr;
  if (!atEnd && $from.pos < block.to) {
    tr = tr.delete($from.pos, block.to);
  }
  const mappedInsert = tr.mapping.map(insertPos);
  const paragraph = right
    ? editor.state.schema.nodes.paragraph.create(null, editor.state.schema.text(right))
    : editor.state.schema.nodes.paragraph.create();
  tr.insert(mappedInsert, paragraph);
  tr.setSelection(TextSelection.near(tr.doc.resolve(mappedInsert + 1)));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Enter in a heading always leaves a paragraph, never another heading.
 * Outline titles insert inside the outline. Folded headings insert after the
 * hidden range. Adjacent empty paragraphs are reused (TrailingNode padding).
 */
export function addParagraphAfterHeading(editor: any): boolean {
  const block = currentTextBlock(editor);
  if (!block || block.typeName !== "heading") return false;

  const { $from } = editor.state.selection;
  if ($from.parent.attrs?.collapsed) {
    return paragraphAfterCollapsedHeading(editor, block);
  }

  if (block.offset !== block.text.length) {
    if (!editor.commands.splitBlock({ keepMarks: true })) return false;
    return editor.chain().setParagraph().run();
  }

  return insertOrReuseParagraphAfter(editor, $from.after($from.depth));
}

export function convertEmptyDecorationToParagraph(editor: any): boolean {
  const block = currentTextBlock(editor);
  if (!block) return false;
  if (block.text.length !== 0) return false;
  const decorativeTypes = new Set(["heading", "blockquote", "callout"]);
  if (!decorativeTypes.has(block.typeName)) return false;
  return editor.chain().setParagraph().run();
}

export { hasNode };
