import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

// ─────────────────────────────────────────────────────────────────────────────
// BlockHandle — Notion-style gutter (Domternal / Notion parity patterns).
//
// • Hover bridge: gutter zone + handle container keep handles visible while
//   moving from block text → +/grip buttons (hideDelay 250ms).
// • Grip: click → block menu, drag → reorder with drop line indicator.
// • + : insert below and open slash menu (Alt+click inserts above).
// ─────────────────────────────────────────────────────────────────────────────

const key = new PluginKey("blockHandle");

const GUTTER_PX = 52;
const HIDE_DELAY_MS = 250;
const AUTO_SCROLL_EDGE = 48;
const AUTO_SCROLL_MAX = 16;

const GRIP_SVG = `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="currentColor"><circle cx="4" cy="3" r="1.25"/><circle cx="10" cy="3" r="1.25"/><circle cx="4" cy="7" r="1.25"/><circle cx="10" cy="7" r="1.25"/><circle cx="4" cy="11" r="1.25"/><circle cx="10" cy="11" r="1.25"/></svg>`;

interface HandleState {
  container: HTMLDivElement;
  addBtn: HTMLSpanElement;
  dragBtn: HTMLSpanElement;
  dropLine: HTMLDivElement;
  target: HTMLElement | null;
  targetPos: number | null;
}

interface BlockHit {
  pos: number;
  node: { nodeSize: number; textContent: string };
  dom: HTMLElement;
}

function findTopLevelBlockAt(view: EditorView, clientX: number, clientY: number): BlockHit | null {
  const posInfo = view.posAtCoords({ left: clientX, top: clientY });
  if (!posInfo) return null;

  const $pos = view.state.doc.resolve(posInfo.pos);
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth - 1).type.name !== "doc") depth--;
  if (depth < 1) return null;

  const pos = $pos.before(depth);
  const node = $pos.node(depth);
  const dom = view.nodeDOM(pos) as HTMLElement | null;
  if (!dom || dom.nodeType !== 1) return null;
  return { pos, node, dom };
}

function findDropPos(view: EditorView, clientY: number): number | null {
  const editorRoot = view.dom.closest(".block-editor-wrapper") as HTMLElement | null;
  const rootRect = editorRoot?.getBoundingClientRect();
  const probeX = rootRect ? rootRect.left + GUTTER_PX + 16 : view.dom.getBoundingClientRect().left + 16;
  const hit = findTopLevelBlockAt(view, probeX, clientY);
  if (!hit) {
    const end = view.state.doc.content.size;
    return end;
  }
  const blockRect = hit.dom.getBoundingClientRect();
  const mid = blockRect.top + blockRect.height / 2;
  if (clientY < mid) return hit.pos;
  return hit.pos + hit.node.nodeSize;
}

function createHandleDom(): HandleState {
  const container = document.createElement("div");
  container.className = "nw-block-handle";
  container.setAttribute("contenteditable", "false");

  const addBtn = document.createElement("span");
  addBtn.className = "nw-block-handle-btn nw-block-handle-add";
  addBtn.setAttribute("role", "button");
  addBtn.setAttribute("tabindex", "-1");
  addBtn.setAttribute("aria-label", "Insert block below");
  addBtn.setAttribute("title", "Click to insert below · Alt-click to insert above");
  addBtn.textContent = "+";

  const dragBtn = document.createElement("span");
  dragBtn.className = "nw-block-handle-btn nw-block-handle-drag";
  dragBtn.setAttribute("role", "button");
  dragBtn.setAttribute("tabindex", "-1");
  dragBtn.setAttribute("aria-label", "Drag to move or click for menu");
  dragBtn.setAttribute("title", "Drag to move · Click for menu");
  dragBtn.innerHTML = GRIP_SVG;
  dragBtn.draggable = true;

  const dropLine = document.createElement("div");
  dropLine.className = "nw-drop-indicator";
  dropLine.style.display = "none";

  container.appendChild(addBtn);
  container.appendChild(dragBtn);

  return { container, addBtn, dragBtn, dropLine, target: null, targetPos: null };
}

function positionHandle(state: HandleState, editorRoot: HTMLElement) {
  if (!state.target) return;
  const targetRect = state.target.getBoundingClientRect();
  const rootRect = editorRoot.getBoundingClientRect();
  const handleH = state.container.offsetHeight || 26;
  const top = targetRect.top - rootRect.top + Math.max(2, (targetRect.height - handleH) / 2);
  state.container.style.top = `${top}px`;
}

function setHoveredBlock(state: HandleState, dom: HTMLElement | null) {
  if (state.target && state.target !== dom) {
    state.target.classList.remove("nw-block-hovered");
  }
  state.target = dom;
  dom?.classList.add("nw-block-hovered");
}

export const BlockHandle = Extension.create({
  name: "blockHandle",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        view(view) {
          const editorRoot =
            (view.dom.closest(".block-editor-wrapper") as HTMLElement | null) ??
            (view.dom.parentElement as HTMLElement | null);
          if (!editorRoot) return { destroy: () => {} };

          editorRoot.classList.add("nw-has-block-handle");

          const state = createHandleDom();
          editorRoot.appendChild(state.container);
          editorRoot.appendChild(state.dropLine);

          let hideTimer: ReturnType<typeof setTimeout> | null = null;
          let pinned = false;
          let menuOpen = false;
          let dragging = false;
          let didDrag = false;
          let autoScrollRaf = 0;
          let pointerMoveRaf = 0;

          const clearHideTimer = () => {
            if (hideTimer) {
              clearTimeout(hideTimer);
              hideTimer = null;
            }
          };

          const show = () => {
            clearHideTimer();
            state.container.classList.add("is-visible");
          };

          const hide = () => {
            if (pinned || menuOpen || dragging) return;
            state.container.classList.remove("is-visible");
            setHoveredBlock(state, null);
            state.targetPos = null;
          };

          const scheduleHide = () => {
            if (pinned || menuOpen || dragging) return;
            clearHideTimer();
            hideTimer = setTimeout(hide, HIDE_DELAY_MS);
          };

          const resolveBlock = (clientX: number, clientY: number): BlockHit | null => {
            const rootRect = editorRoot.getBoundingClientRect();
            if (clientY < rootRect.top || clientY > rootRect.bottom) return null;
            if (clientX < rootRect.left - 12 || clientX > rootRect.right + 8) return null;
            const inGutter = clientX < rootRect.left + GUTTER_PX;
            const probeX = inGutter ? rootRect.left + GUTTER_PX + 12 : clientX;
            return findTopLevelBlockAt(view, probeX, clientY);
          };

          const activateBlock = (hit: BlockHit) => {
            if (state.target === hit.dom && state.targetPos === hit.pos) return;
            setHoveredBlock(state, hit.dom);
            state.targetPos = hit.pos;
            positionHandle(state, editorRoot);
            show();
          };

          // Hit-testing walks the document, so coalesce to one probe per frame
          // rather than one per mousemove — the pointer often rests over the
          // text the user is typing into.
          const onPointerMove = (e: MouseEvent) => {
            if (!view.editable || dragging || pointerMoveRaf) return;
            const { clientX, clientY, target } = e;
            pointerMoveRaf = requestAnimationFrame(() => {
              pointerMoveRaf = 0;
              if (!view.editable || dragging) return;
              const hit = resolveBlock(clientX, clientY);
              if (hit) {
                activateBlock(hit);
                clearHideTimer();
              } else if (!pinned && !state.container.contains(target as Node)) {
                scheduleHide();
              }
            });
          };

          const onEditorLeave = (e: MouseEvent) => {
            const to = e.relatedTarget as Node | null;
            if (to && (state.container.contains(to) || editorRoot.contains(to))) return;
            scheduleHide();
          };

          const onScroll = () => {
            if (state.target && state.container.classList.contains("is-visible")) {
              positionHandle(state, editorRoot);
            }
          };

          const openSlashAfter = () => {
            if (state.targetPos == null || !state.target) return;
            const node = view.state.doc.nodeAt(state.targetPos);
            if (!node) return;
            const insertPos = state.targetPos + node.nodeSize;
            const tr = view.state.tr.insert(insertPos, view.state.schema.nodes.paragraph.create());
            const sel = TextSelection.near(tr.doc.resolve(insertPos + 1));
            tr.setSelection(sel).scrollIntoView();
            view.dispatch(tr);
            view.focus();
            setTimeout(() => view.dispatch(view.state.tr.insertText("/")), 0);
          };

          const openBlockMenu = (e?: MouseEvent) => {
            if (state.targetPos == null) return;
            menuOpen = true;
            show();
            const rect = state.container.getBoundingClientRect();
            const detail = {
              pos: state.targetPos,
              x: rect.right + 4,
              y: rect.top,
            };
            window.dispatchEvent(new CustomEvent("nw:blockMenu", { detail }));
          };

          const onAddClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            pinned = true;
            if (e.altKey) {
              if (state.targetPos == null) return;
              const tr = view.state.tr.insert(
                state.targetPos,
                view.state.schema.nodes.paragraph.create(),
              );
              view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(state.targetPos + 1))));
              view.focus();
              setTimeout(() => view.dispatch(view.state.tr.insertText("/")), 0);
            } else {
              openSlashAfter();
            }
            pinned = false;
          };

          const onDragClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (didDrag) {
              didDrag = false;
              return;
            }
            openBlockMenu(e);
          };

          const positionDropLine = (clientY: number) => {
            const dropPos = findDropPos(view, clientY);
            if (dropPos == null) return;
            const coords = view.coordsAtPos(Math.min(dropPos, view.state.doc.content.size));
            const rootRect = editorRoot.getBoundingClientRect();
            state.dropLine.style.display = "block";
            state.dropLine.style.top = `${coords.top - rootRect.top - 1}px`;
            state.dropLine.style.left = `${GUTTER_PX}px`;
            state.dropLine.style.right = "0";
          };

          const stopAutoScroll = () => {
            if (autoScrollRaf) cancelAnimationFrame(autoScrollRaf);
            autoScrollRaf = 0;
          };

          const startAutoScroll = (clientY: number) => {
            stopAutoScroll();
            const scrollParent = editorRoot.closest(".overflow-y-auto") as HTMLElement | null;
            if (!scrollParent) return;

            const tick = () => {
              const rect = scrollParent.getBoundingClientRect();
              let delta = 0;
              if (clientY < rect.top + AUTO_SCROLL_EDGE) {
                delta = -Math.min(AUTO_SCROLL_MAX, AUTO_SCROLL_EDGE - (clientY - rect.top));
              } else if (clientY > rect.bottom - AUTO_SCROLL_EDGE) {
                delta = Math.min(AUTO_SCROLL_MAX, clientY - (rect.bottom - AUTO_SCROLL_EDGE));
              }
              if (delta !== 0) scrollParent.scrollTop += delta;
              autoScrollRaf = requestAnimationFrame(tick);
            };
            autoScrollRaf = requestAnimationFrame(tick);
          };

          let duplicateOnDrop = false;

          const onDragStart = (e: DragEvent) => {
            if (state.targetPos == null || !state.target) return;
            const node = view.state.doc.nodeAt(state.targetPos);
            if (!node) return;
            duplicateOnDrop = e.altKey;
            dragging = true;
            didDrag = true;
            show();
            const slice = view.state.doc.slice(state.targetPos, state.targetPos + node.nodeSize);
            const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, state.targetPos));
            view.dispatch(tr);
            (view as any).dragging = { slice, move: true };
            e.dataTransfer?.setData("text/plain", node.textContent || " ");
            e.dataTransfer?.setData("text/html", state.target.outerHTML);
            if (e.dataTransfer) {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setDragImage(state.target, 0, 0);
            }
            window.dispatchEvent(new CustomEvent("nw:dismiss-overlays"));
          };

          const onDragEnd = () => {
            dragging = false;
            if (duplicateOnDrop && state.targetPos != null) {
              const node = view.state.doc.nodeAt(state.targetPos);
              if (node) {
                const insertPos = state.targetPos + node.nodeSize;
                const tr = view.state.tr.insert(insertPos, node.copy(node.content));
                view.dispatch(tr);
              }
            }
            duplicateOnDrop = false;
            (view as any).dragging = null;
            state.dropLine.style.display = "none";
            stopAutoScroll();
            setTimeout(() => {
              didDrag = false;
            }, 0);
            scheduleHide();
          };

          const onDragOver = (e: DragEvent) => {
            if (!(view as any).dragging) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            positionDropLine(e.clientY);
            startAutoScroll(e.clientY);
          };

          const onHandleEnter = () => {
            pinned = true;
            clearHideTimer();
            show();
          };

          const onHandleLeave = (e: MouseEvent) => {
            pinned = false;
            const to = e.relatedTarget as Node | null;
            if (to && editorRoot.contains(to)) return;
            scheduleHide();
          };

          const onMenuClose = () => {
            menuOpen = false;
            scheduleHide();
          };

          state.addBtn.addEventListener("click", onAddClick);
          state.dragBtn.addEventListener("click", onDragClick);
          state.dragBtn.addEventListener("dragstart", onDragStart);
          state.dragBtn.addEventListener("dragend", onDragEnd);
          state.container.addEventListener("mouseenter", onHandleEnter);
          state.container.addEventListener("mouseleave", onHandleLeave);

          editorRoot.addEventListener("mousemove", onPointerMove);
          editorRoot.addEventListener("mouseleave", onEditorLeave);
          view.dom.addEventListener("dragover", onDragOver);
          window.addEventListener("scroll", onScroll, true);
          window.addEventListener("nw:blockMenu:close", onMenuClose);

          return {
            destroy: () => {
              clearHideTimer();
              stopAutoScroll();
              if (pointerMoveRaf) cancelAnimationFrame(pointerMoveRaf);
              editorRoot.removeEventListener("mousemove", onPointerMove);
              editorRoot.removeEventListener("mouseleave", onEditorLeave);
              view.dom.removeEventListener("dragover", onDragOver);
              window.removeEventListener("scroll", onScroll, true);
              window.removeEventListener("nw:blockMenu:close", onMenuClose);
              state.container.remove();
              state.dropLine.remove();
              editorRoot.classList.remove("nw-has-block-handle");
              setHoveredBlock(state, null);
            },
          };
        },
      }),
    ];
  },
});
