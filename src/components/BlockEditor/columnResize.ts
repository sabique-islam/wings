import type { Editor } from "@tiptap/core";
import { columnTemplateCss, parseColumnWidths, resizeColumnPair, serializeColumnWidths } from "./columnWidths";

function posFromGetPos(getPos: unknown): number | null {
  if (typeof getPos !== "function") return null;
  const pos = getPos();
  return typeof pos === "number" ? pos : null;
}

function listAtColumn(editor: Editor, columnPos: number) {
  const $pos = editor.state.doc.resolve(columnPos);
  if ($pos.parent.type.name !== "columnList") return null;
  return {
    listPos: $pos.before($pos.depth),
    colIndex: $pos.index(),
    count: $pos.parent.childCount,
  };
}

function persistWidths(editor: Editor, listPos: number, widths: number[] | null) {
  const list = editor.state.doc.nodeAt(listPos);
  if (!list || list.type.name !== "columnList") return;
  const next = widths == null ? null : parseColumnWidths(serializeColumnWidths(widths), list.childCount);
  const prev = list.attrs.widths ?? null;
  const prevKey = prev == null ? "" : serializeColumnWidths(parseColumnWidths(prev, list.childCount));
  const nextKey = next == null ? "" : serializeColumnWidths(next);
  if (prevKey === nextKey) return;
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(listPos, undefined, {
      ...list.attrs,
      cols: list.childCount,
      widths: next,
    }),
  );
}

function paintPreview(listDom: HTMLElement, widths: number[]) {
  listDom.style.setProperty("--nw-col-template", columnTemplateCss(widths));
}

/** Drag `::` to split weight between this column and the next. Double-click resets. */
export function bindColumnResize(handle: HTMLElement, editor: Editor, getPos: unknown): () => void {
  let onMove: ((event: MouseEvent) => void) | null = null;
  let onUp: (() => void) | null = null;

  const stopWindow = () => {
    if (onMove) window.removeEventListener("mousemove", onMove);
    if (onUp) window.removeEventListener("mouseup", onUp);
    onMove = null;
    onUp = null;
    handle.classList.remove("is-dragging");
    document.body.classList.remove("nw-col-resizing");
  };

  const onDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const columnPos = posFromGetPos(getPos);
    if (columnPos == null) return;
    const ctx = listAtColumn(editor, columnPos);
    if (!ctx || ctx.colIndex >= ctx.count - 1) return;
    const list = editor.state.doc.nodeAt(ctx.listPos);
    const listDom = editor.view.nodeDOM(ctx.listPos);
    if (!list || !(listDom instanceof HTMLElement)) return;
    const listWidth = listDom.getBoundingClientRect().width;
    if (listWidth < 8) return;

    const startX = event.clientX;
    const startWidths = parseColumnWidths(list.attrs.widths, list.childCount);
    const total = startWidths.reduce((sum, weight) => sum + weight, 0);
    let preview: number[] | null = null;
    let moved = false;

    handle.classList.add("is-dragging");
    document.body.classList.add("nw-col-resizing");

    onMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      if (!moved && Math.abs(dx) < 2) return;
      moved = true;
      const delta = (dx / listWidth) * total;
      preview = resizeColumnPair(startWidths, ctx.colIndex, delta);
      paintPreview(listDom, preview);
    };
    onUp = () => {
      stopWindow();
      if (!moved || !preview) return;
      persistWidths(editor, ctx.listPos, preview);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onDblClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const columnPos = posFromGetPos(getPos);
    if (columnPos == null) return;
    const ctx = listAtColumn(editor, columnPos);
    if (!ctx) return;
    persistWidths(editor, ctx.listPos, null);
  };

  handle.addEventListener("mousedown", onDown);
  handle.addEventListener("dblclick", onDblClick);
  return () => {
    stopWindow();
    handle.removeEventListener("mousedown", onDown);
    handle.removeEventListener("dblclick", onDblClick);
  };
}
