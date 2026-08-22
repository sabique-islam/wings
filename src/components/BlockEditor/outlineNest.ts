import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { isMarkdownSuggestionOpen } from "./markdownInput";
import type { BlockPos } from "./blockUtils";
import { isSelectionInCodeBlock } from "./blockUtils";

/** Parents that may receive a nested block (AFFiNE indent). */
export const NESTABLE_PARENTS = new Set([
  "outlineBlock",
  "blockquote",
  "callout",
  "toggleBlock",
  "listItem",
  "taskItem",
]);

const WRAP_AS_OUTLINE = new Set(["paragraph", "heading"]);

/** Never indent a block into these — Tab is a no-op (or table navigation). */
export const NEVER_PARENTS = new Set([
  "codeBlock",
  "horizontalRule",
  "image",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "database",
  "excalidraw",
  "embed",
  "bookmark",
  "pageEmbed",
  "blockMath",
  "columnList",
]);

export function hasBlockChildren(node: { forEach: (fn: (child: { isBlock: boolean }) => void) => void }): boolean {
  let found = false;
  node.forEach((child) => {
    if (child.isBlock) found = true;
  });
  return found;
}

/** Text of a mixed paragraph/heading, ignoring nested block children. */
export function inlineTextOf(node: {
  forEach: (fn: (child: { isBlock: boolean; isText?: boolean; text?: string; textContent: string }) => void) => void;
}): string {
  let text = "";
  node.forEach((child) => {
    if (child.isBlock) return;
    text += child.isText ? (child.text ?? "") : child.textContent;
  });
  return text;
}

/** Content size of leading inlines, before the first nested block. */
export function inlineContentSize(node: {
  forEach: (fn: (child: { isBlock: boolean; nodeSize: number }) => void) => void;
}): number {
  let size = 0;
  let seenBlock = false;
  node.forEach((child) => {
    if (seenBlock || child.isBlock) {
      seenBlock = true;
      return;
    }
    size += child.nodeSize;
  });
  return size;
}

export function isInsideTable($from: BlockPos): boolean {
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (name === "table" || name === "tableCell" || name === "tableHeader") return true;
  }
  return false;
}

/** Duck-typed PM node — avoid importing Node (nested prosemirror-model copies). */
type OutlinePmNode = {
  isBlock: boolean;
  nodeSize: number;
  type: { name: string };
  content: unknown;
  copy: (content: unknown) => OutlinePmNode;
};

function previousBlockSibling(
  parent: { child: (i: number) => OutlinePmNode },
  index: number,
): { node: OutlinePmNode; sizeBefore: number } | null {
  let sizeBefore = 0;
  let found: { node: OutlinePmNode; sizeBefore: number } | null = null;
  for (let i = 0; i < index; i++) {
    const child = parent.child(i);
    if (child.isBlock) found = { node: child, sizeBefore };
    sizeBefore += child.nodeSize;
  }
  return found;
}

function canAppend(parent: { type: { name: string; validContent: (content: unknown) => boolean }; content: { append: (fragment: unknown) => unknown } }, child: unknown): boolean {
  if (NEVER_PARENTS.has(parent.type.name)) return false;
  if (!NESTABLE_PARENTS.has(parent.type.name)) return false;
  try {
    const next = parent.content.append(Fragment.from(child as never));
    return parent.type.validContent(next);
  } catch {
    return false;
  }
}

function canWrapAsOutline(schema: { nodes: Record<string, { validContent: (content: unknown) => boolean } | undefined> }, a: unknown, b: unknown): boolean {
  const type = schema.nodes.outlineBlock;
  if (!type) return false;
  try {
    return type.validContent(Fragment.from([a as never, b as never]));
  } catch {
    return false;
  }
}

/** Move the whole outline when the caret is in its title (first child). */
function moveDepthOf($from: { parent?: { isTextblock?: boolean }; depth: number; node: (d: number) => { type: { name: string } }; index: (d: number) => number }): number | null {
  if (!$from.parent?.isTextblock) return null;
  if ($from.depth < 1) return null;
  const parent = $from.node($from.depth - 1);
  const index = $from.index($from.depth - 1);
  if (parent.type.name === "outlineBlock" && index === 0) return $from.depth - 1;
  return $from.depth;
}

/**
 * Indent the current text block under the previous block sibling, if that
 * sibling can hold children. Returns false when nothing moved (caller may
 * still consume Tab so the gutter does not steal focus).
 */
export function nestCurrentBlock(editor: {
  state: any;
  view: { dispatch: (tr: any) => void };
}): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  if (isMarkdownSuggestionOpen(state)) return false;
  if (isInsideTable($from)) return false;
  if (isSelectionInCodeBlock($from)) return false;

  const depth = moveDepthOf($from);
  if (depth == null || depth < 1) return false;

  const parent = $from.node(depth - 1);
  const index = $from.index(depth - 1);
  const prev = previousBlockSibling(parent, index);
  if (!prev) return false;
  if (NEVER_PARENTS.has(prev.node.type.name)) return false;

  const block = $from.node(depth);
  const blockPos = $from.before(depth);
  const start = $from.start(depth - 1);
  const prevPos = start + prev.sizeBefore;
  const tr = state.tr;

  if (WRAP_AS_OUTLINE.has(prev.node.type.name)) {
    if (!canWrapAsOutline(state.schema, prev.node, block)) return false;
    const wrapper = state.schema.nodes.outlineBlock.create(
      null,
      Fragment.from([prev.node.copy(prev.node.content), block.copy(block.content)]),
    );
    tr.delete(blockPos, blockPos + block.nodeSize);
    tr.replaceWith(prevPos, prevPos + prev.node.nodeSize, wrapper);
    const wrapped = tr.doc.nodeAt(prevPos);
    const last = wrapped?.lastChild;
    const caret = last ? prevPos + wrapped.nodeSize - last.nodeSize + 1 : prevPos + 1;
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(caret, tr.doc.content.size))));
    tr.scrollIntoView();
    view.dispatch(tr);
    return true;
  }

  if (!canAppend(prev.node as any, block)) return false;
  const insertPos = prevPos + prev.node.nodeSize - 1;
  tr.delete(blockPos, blockPos + block.nodeSize);
  const mappedInsert = tr.mapping.map(insertPos);
  tr.insert(mappedInsert, block.copy(block.content));
  tr.setSelection(TextSelection.near(tr.doc.resolve(mappedInsert + 1)));
  tr.scrollIntoView();
  view.dispatch(tr);
  return true;
}

function unwrapSingletonOutline(tr: any, pos: number) {
  const node = tr.doc.nodeAt(pos);
  if (!node || node.type.name !== "outlineBlock" || node.childCount !== 1 || !node.firstChild) return;
  tr.replaceWith(pos, pos + node.nodeSize, node.firstChild.copy(node.firstChild.content));
}

/** Lift the current text block to sit after its nestable parent. */
export function liftCurrentBlock(editor: {
  state: any;
  view: { dispatch: (tr: any) => void };
}): boolean {
  const { state, view } = editor;
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;
  if (isMarkdownSuggestionOpen(state)) return false;
  if (isInsideTable($from)) return false;
  if (isSelectionInCodeBlock($from)) return false;

  const depth = moveDepthOf($from);
  if (depth == null || depth < 2) return false;

  const parent = $from.node(depth - 1);
  if (parent.type.name === "doc") return false;
  if (!NESTABLE_PARENTS.has(parent.type.name)) return false;

  const blockPos = $from.before(depth);
  const block = $from.node(depth);
  const parentPos = $from.before(depth - 1);
  const parentEnd = $from.after(depth - 1);

  const tr = state.tr;
  const lifted = block.copy(block.content);
  tr.insert(parentEnd, lifted);
  tr.delete(blockPos, blockPos + block.nodeSize);

  unwrapSingletonOutline(tr, parentPos);

  const parentAfter = tr.doc.nodeAt(parentPos);
  if (
    parentAfter &&
    parentAfter.childCount === 0 &&
    (parentAfter.type.name === "blockquote" ||
      parentAfter.type.name === "callout" ||
      parentAfter.type.name === "toggleBlock")
  ) {
    tr.delete(parentPos, parentPos + parentAfter.nodeSize);
  }

  const mappedInsert = tr.mapping.map(parentEnd);
  const caret = Math.min(mappedInsert + 1, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(caret, tr.doc.content.size))));
  view.dispatch(tr.scrollIntoView());
  return true;
}
