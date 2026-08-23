import { Extension, type Editor } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import {
  coveringRangeForPositions,
  deleteBlocksAtPositions,
  duplicateBlocksAtPositions,
  getTopLevelBlockPos,
  isInMarginDragZone,
  MARGIN_DRAG_ZONE_PX,
  rangeSelect,
  resolveShiftClickAnchor,
  selectCurrentBlock,
  shouldPromoteToBlockRange,
  stepBlockSelection,
  toggleBlockInSelection,
  type BlockDoc,
  type BlockPos,
} from "./blockUtils";
import {
  blockSelectionKey,
  EMPTY_BLOCK_SELECTION,
  getBlockSelectionState,
  getSelectedBlockPositions,
  sameBlockPositions,
  type BlockSelectionState,
} from "./blockSelectionKey";
import { topLevelBlockPosAtCoords } from "./blockHit";
import { sliceToHtml, sliceToMarkdown } from "./copyMarkdown";

export { blockSelectionKey, getSelectedBlockPositions } from "./blockSelectionKey";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockSelection: {
      setBlockSelection: (positions: number[], anchor?: number | null) => ReturnType;
      clearBlockSelection: () => ReturnType;
    };
  }
}

function setBlockSelection(view: EditorView, positions: number[], anchor: number | null = null) {
  const current = getBlockSelectionState(view.state);
  if (sameBlockPositions(current.positions, positions) && current.anchor === anchor) return;
  view.dispatch(
    view.state.tr.setMeta(blockSelectionKey, { positions, anchor } satisfies BlockSelectionState),
  );
}

/** Resolve a Y coordinate against a point inside the text column, not the gutter. */
function posAtClientY(view: EditorView, clientY: number): number | null {
  const rect = view.dom.getBoundingClientRect();
  return topLevelBlockPosAtCoords(view, rect.left + 16, clientY);
}

function posFromEvent(view: EditorView, event: MouseEvent, probeY = false): number | null {
  if (probeY) return posAtClientY(view, event.clientY);
  return topLevelBlockPosAtCoords(view, event.clientX, event.clientY);
}

/**
 * Notion's margin drag: pressing in the left gutter and dragging sweeps whole
 * blocks rather than placing a caret. Ignored on a plain click so clicking the
 * margin still focuses the nearest line.
 */
function startMarginDrag(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0) return false;
  const contentRect = view.dom.getBoundingClientRect();
  if (!isInMarginDragZone(event.clientX - contentRect.left, MARGIN_DRAG_ZONE_PX)) return false;

  const anchor = posAtClientY(view, event.clientY);
  if (anchor == null) return false;

  let dragged = false;

  const onMove = (move: MouseEvent) => {
    const target = posAtClientY(view, move.clientY);
    if (target == null) return;
    dragged = true;
    setBlockSelection(view, rangeSelect(anchor, target, view.state.doc as BlockDoc), anchor);
  };

  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    if (!dragged) setBlockSelection(view, [], null);
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
  event.preventDefault();
  return true;
}

/**
 * Stay a text selection until the pointer enters a second top-level block,
 * then promote to a block range.
 */
function startContentDrag(view: EditorView, event: MouseEvent): void {
  if (event.button !== 0) return;
  const start = posFromEvent(view, event);
  if (start == null) return;

  const onMove = (move: MouseEvent) => {
    const target = posFromEvent(view, move);
    if (target == null || !shouldPromoteToBlockRange(start, target)) return;
    move.preventDefault();
    window.getSelection()?.removeAllRanges();
    setBlockSelection(view, rangeSelect(start, target, view.state.doc as BlockDoc), start);
  };

  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function replaceBlockSelection(view: EditorView, text: string): boolean {
  const { positions } = getBlockSelectionState(view.state);
  if (positions.length === 0) return false;
  const sorted = [...positions].sort((a, b) => b - a);
  let tr = view.state.tr;
  for (const pos of sorted) {
    const node = tr.doc.nodeAt(pos);
    if (!node) continue;
    tr = tr.delete(pos, pos + node.nodeSize);
  }
  tr.setMeta(blockSelectionKey, EMPTY_BLOCK_SELECTION);
  const mapped = Math.min(sorted[sorted.length - 1]!, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(1, mapped))));
  if (text) tr.insertText(text);
  view.dispatch(tr.scrollIntoView());
  return true;
}

function writeBlockSelectionClipboard(view: EditorView, event: ClipboardEvent, editor: Editor): boolean {
  const positions = getSelectedBlockPositions(view.state);
  if (positions.length === 0) return false;
  const range = coveringRangeForPositions(view.state.doc, positions);
  if (!range) return false;
  const markdown = sliceToMarkdown(editor, range.from, range.to);
  const html = sliceToHtml(editor, range.from, range.to);
  event.clipboardData?.setData("text/plain", markdown);
  if (html) event.clipboardData?.setData("text/html", html);
  event.preventDefault();
  return true;
}

export const BlockSelection = Extension.create({
  name: "blockSelection",
  priority: 201,

  addCommands() {
    return {
      setBlockSelection:
        (positions, anchor = null) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(blockSelectionKey, { positions, anchor } satisfies BlockSelectionState);
          return true;
        },
      clearBlockSelection:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(blockSelectionKey, EMPTY_BLOCK_SELECTION);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: blockSelectionKey,
        state: {
          init(): BlockSelectionState {
            return EMPTY_BLOCK_SELECTION;
          },
          apply(tr, value): BlockSelectionState {
            const meta = tr.getMeta(blockSelectionKey) as BlockSelectionState | undefined;
            if (meta) return meta;
            if (!tr.docChanged) return value;
            const positions = value.positions
              .map((p) => tr.mapping.map(p))
              .filter((p) => {
                const node = tr.doc.nodeAt(p);
                return node?.isBlock;
              });
            return {
              positions,
              anchor: value.anchor != null ? tr.mapping.map(value.anchor) : null,
            };
          },
        },
        props: {
          decorations(state) {
            const { positions } = getBlockSelectionState(state);
            const decos: Decoration[] = [];
            for (const pos of positions) {
              const node = state.doc.nodeAt(pos);
              if (!node) continue;
              decos.push(
                Decoration.node(pos, pos + node.nodeSize, { class: "nw-block-selected" }),
              );
            }
            return DecorationSet.create(state.doc, decos);
          },
          handleTextInput(view, _from, _to, text) {
            if (getBlockSelectionState(view.state).positions.length === 0) return false;
            return replaceBlockSelection(view, text);
          },
          handleDOMEvents: {
            mousedown(view, event) {
              const e = event as MouseEvent;
              if (e.button !== 0) return false;

              if (e.shiftKey) {
                const blockPos = posFromEvent(view, e);
                if (blockPos == null) return false;
                e.preventDefault();
                const pluginState = getBlockSelectionState(view.state);
                const caretBlock = getTopLevelBlockPos(view.state.selection.$from as BlockPos);
                const anchor = resolveShiftClickAnchor(pluginState.anchor, caretBlock, blockPos);
                setBlockSelection(view, rangeSelect(anchor, blockPos, view.state.doc as BlockDoc), anchor);
                return true;
              }

              if (e.metaKey || e.ctrlKey) {
                const blockPos = posFromEvent(view, e);
                if (blockPos == null) return false;
                e.preventDefault();
                const pluginState = getBlockSelectionState(view.state);
                const next = toggleBlockInSelection(pluginState.positions, pluginState.anchor, blockPos);
                setBlockSelection(view, next.positions, next.anchor);
                return true;
              }

              if (startMarginDrag(view, e)) return true;
              if (getBlockSelectionState(view.state).positions.length > 0) {
                setBlockSelection(view, [], null);
              }
              startContentDrag(view, e);
              return false;
            },
            copy(view, event) {
              return writeBlockSelectionClipboard(view, event as ClipboardEvent, editor);
            },
            cut(view, event) {
              if (!writeBlockSelectionClipboard(view, event as ClipboardEvent, editor)) return false;
              const positions = getSelectedBlockPositions(view.state);
              deleteBlocksAtPositions(editor, positions);
              return true;
            },
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    /**
     * Only acts while blocks are selected, so the caret keeps its normal arrow
     * behaviour when the user is just typing.
     */
    const walk = (direction: -1 | 1, extend: boolean) => () => {
      const { positions, anchor } = getBlockSelectionState(this.editor.state);
      if (positions.length === 0) return false;
      const next = stepBlockSelection(
        this.editor.state.doc as BlockDoc,
        positions,
        anchor,
        direction,
        extend,
      );
      if (!next) return false;
      const view = this.editor.view;
      view.dispatch(view.state.tr.setMeta(blockSelectionKey, next satisfies BlockSelectionState));
      const head = direction > 0 ? Math.max(...next.positions) : Math.min(...next.positions);
      const dom = view.nodeDOM(head);
      if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "nearest" });
      return true;
    };

    return {
      ArrowDown: walk(1, false),
      ArrowUp: walk(-1, false),
      "Shift-ArrowDown": walk(1, true),
      "Shift-ArrowUp": walk(-1, true),

      Escape: () => {
        const positions = getSelectedBlockPositions(this.editor.state);
        if (positions.length > 0) {
          setBlockSelection(this.editor.view, [], null);
          return true;
        }
        const pos = selectCurrentBlock(this.editor);
        if (pos == null) return false;
        setBlockSelection(this.editor.view, [pos], pos);
        return true;
      },

      "Mod-/": () => {
        let positions = getSelectedBlockPositions(this.editor.state);
        if (positions.length === 0) {
          const pos = selectCurrentBlock(this.editor);
          if (pos != null) positions = [pos];
        }
        if (positions.length === 0) return false;
        setBlockSelection(this.editor.view, positions, positions[0] ?? null);
        const rect = this.editor.view.coordsAtPos(positions[0]!);
        window.dispatchEvent(
          new CustomEvent("nw:blockActionMenu", {
            detail: { positions, x: rect.left, y: rect.bottom + 4 },
          }),
        );
        return true;
      },

      Backspace: () => {
        const positions = getSelectedBlockPositions(this.editor.state);
        if (positions.length === 0) return false;
        deleteBlocksAtPositions(this.editor, positions);
        return true;
      },

      Delete: () => {
        const positions = getSelectedBlockPositions(this.editor.state);
        if (positions.length === 0) return false;
        deleteBlocksAtPositions(this.editor, positions);
        return true;
      },

      "Mod-x": () => {
        const positions = getSelectedBlockPositions(this.editor.state);
        if (positions.length === 0) return false;
        const range = coveringRangeForPositions(this.editor.state.doc, positions);
        if (range) {
          const markdown = sliceToMarkdown(this.editor, range.from, range.to);
          const html = sliceToHtml(this.editor, range.from, range.to);
          void navigator.clipboard?.writeText(markdown).catch(() => undefined);
          if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
            void navigator.clipboard
              .write([
                new ClipboardItem({
                  "text/plain": new Blob([markdown], { type: "text/plain" }),
                  "text/html": new Blob([html], { type: "text/html" }),
                }),
              ])
              .catch(() => undefined);
          }
        }
        deleteBlocksAtPositions(this.editor, positions);
        return true;
      },

      "Mod-d": () => {
        const positions = getSelectedBlockPositions(this.editor.state);
        if (positions.length > 1) {
          duplicateBlocksAtPositions(this.editor, positions);
          return true;
        }
        return false;
      },
    };
  },
});
