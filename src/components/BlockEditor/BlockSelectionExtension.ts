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
import {
  blocksInSweep,
  listSelectableBlockRects,
  pointInRect,
  sweepRectFromPoints,
  type SweepRect,
} from "./blockSweep";
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

const AUTO_SCROLL_EDGE = 48;
const AUTO_SCROLL_MAX = 16;
const SWEEP_CLASS = "is-block-sweeping";

function posFromEvent(view: EditorView, event: MouseEvent): number | null {
  return topLevelBlockPosAtCoords(view, event.clientX, event.clientY);
}

function blockClientRect(view: EditorView, pos: number): SweepRect | null {
  let dom = view.nodeDOM(pos);
  if (dom && dom.nodeType !== 1) dom = (dom as Node).parentElement;
  if (!(dom instanceof HTMLElement)) return null;
  const rect = dom.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function nativeRangeSpansBlocks(view: EditorView): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return false;
  try {
    const start = view.posAtDOM(range.startContainer, range.startOffset);
    const end = view.posAtDOM(range.endContainer, range.endOffset);
    const startBlock = getTopLevelBlockPos(view.state.doc.resolve(start) as BlockPos);
    const endBlock = getTopLevelBlockPos(view.state.doc.resolve(end) as BlockPos);
    return startBlock != null && endBlock != null && startBlock !== endBlock;
  } catch {
    return false;
  }
}

function isGutterPress(view: EditorView, event: MouseEvent): boolean {
  const contentRect = view.dom.getBoundingClientRect();
  return isInMarginDragZone(event.clientX - contentRect.left, MARGIN_DRAG_ZONE_PX);
}

function isEmptyEditorChrome(view: EditorView, event: MouseEvent): boolean {
  return event.target === view.dom;
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
  const parent = el.closest(".overflow-y-auto");
  return parent instanceof HTMLElement ? parent : null;
}

function expandSweepToColumn(userRect: SweepRect, view: EditorView): SweepRect {
  const content = view.dom.getBoundingClientRect();
  const left = Math.min(userRect.left, content.left);
  const right = Math.max(userRect.left + userRect.width, content.right);
  return { left, top: userRect.top, width: right - left, height: userRect.height };
}

/**
 * One pointer session: stay a native text selection until the gesture leaves
 * the start block or spans two top-level blocks, then sweep by DOM rects.
 * Gutter presses enter the sweep immediately (and steal the event). Empty
 * editor chrome promotes on the first move so a plain click can still focus.
 */
function startPointerSession(
  view: EditorView,
  event: MouseEvent,
  opts: { stealEvent: boolean; expandToColumn: boolean },
): void {
  const startX = event.clientX;
  const startY = event.clientY;
  const startBlock = topLevelBlockPosAtCoords(view, event.clientX, event.clientY);
  const scrollParent = findScrollParent(view.dom);
  const startScrollLeft = scrollParent?.scrollLeft ?? window.scrollX;
  const startScrollTop = scrollParent?.scrollTop ?? window.scrollY;
  const promoteOnMove = opts.expandToColumn;

  let sweeping = opts.stealEvent;
  let applied = false;
  let raf = 0;
  let overlay: HTMLDivElement | null = null;
  let lastX = startX;
  let lastY = startY;
  let autoScrollRaf = 0;
  let autoScrollY = startY;

  const stopAutoScroll = () => {
    if (autoScrollRaf) cancelAnimationFrame(autoScrollRaf);
    autoScrollRaf = 0;
  };

  const tickAutoScroll = () => {
    if (!scrollParent) return;
    const rect = scrollParent.getBoundingClientRect();
    let delta = 0;
    if (autoScrollY < rect.top + AUTO_SCROLL_EDGE) {
      delta = -Math.min(AUTO_SCROLL_MAX, AUTO_SCROLL_EDGE - (autoScrollY - rect.top));
    } else if (autoScrollY > rect.bottom - AUTO_SCROLL_EDGE) {
      delta = Math.min(AUTO_SCROLL_MAX, autoScrollY - (rect.bottom - AUTO_SCROLL_EDGE));
    }
    if (delta !== 0) scrollParent.scrollTop += delta;
    autoScrollRaf = requestAnimationFrame(tickAutoScroll);
  };

  const enterSweep = () => {
    if (sweeping && applied) return;
    sweeping = true;
    window.getSelection()?.removeAllRanges();
    view.dom.classList.add(SWEEP_CLASS);
    if (!autoScrollRaf && scrollParent) autoScrollRaf = requestAnimationFrame(tickAutoScroll);
  };

  const userRectAt = (x: number, y: number): SweepRect => {
    const dx = (scrollParent?.scrollLeft ?? window.scrollX) - startScrollLeft;
    const dy = (scrollParent?.scrollTop ?? window.scrollY) - startScrollTop;
    const rect = sweepRectFromPoints(startX - dx, startY - dy, x, y);
    return opts.expandToColumn ? expandSweepToColumn(rect, view) : rect;
  };

  const applySweep = (x: number, y: number) => {
    const userRect = userRectAt(x, y);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "nw-block-sweep";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }
    overlay.style.left = `${userRect.left}px`;
    overlay.style.top = `${userRect.top}px`;
    overlay.style.width = `${Math.max(userRect.width, 1)}px`;
    overlay.style.height = `${Math.max(userRect.height, 1)}px`;

    const positions = blocksInSweep(listSelectableBlockRects(view), userRect);
    setBlockSelection(view, positions, startBlock ?? positions[0] ?? null);
    applied = true;
  };

  if (opts.stealEvent) {
    event.preventDefault();
    enterSweep();
  }

  const onMove = (move: MouseEvent) => {
    lastX = move.clientX;
    lastY = move.clientY;
    autoScrollY = move.clientY;

    if (!sweeping) {
      if (promoteOnMove) {
        enterSweep();
      } else {
        const liveStart = startBlock != null ? blockClientRect(view, startBlock) : null;
        const leftStart = liveStart != null && !pointInRect(move.clientX, move.clientY, liveStart);
        if (!leftStart && !nativeRangeSpansBlocks(view)) return;
        enterSweep();
      }
    }

    move.preventDefault();
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      applySweep(lastX, lastY);
    });
  };

  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    if (raf) cancelAnimationFrame(raf);
    stopAutoScroll();
    view.dom.classList.remove(SWEEP_CLASS);
    overlay?.remove();
    overlay = null;
    if (opts.stealEvent && !applied) setBlockSelection(view, [], null);
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
                const caretBlock = getTopLevelBlockPos(view.state.selection.$from as BlockPos);
                if (caretBlock === blockPos) return false;
                e.preventDefault();
                const pluginState = getBlockSelectionState(view.state);
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

              const gutter = isGutterPress(view, e);
              const chrome = isEmptyEditorChrome(view, e);
              if (getBlockSelectionState(view.state).positions.length > 0) {
                setBlockSelection(view, [], null);
              }
              startPointerSession(view, e, { stealEvent: gutter, expandToColumn: gutter || chrome });
              return gutter;
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
