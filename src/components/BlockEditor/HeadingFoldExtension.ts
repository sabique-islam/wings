import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { collapsedSiblings, toggleHeadingCollapsedAt } from "./headingFold";

export const headingFoldKey = new PluginKey("headingFold");

const CHEVRON =
  '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 4.5 L6 8 L9 4.5" /></svg>';

function foldButton(view: EditorView, headingPos: number, collapsed: boolean): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `nw-heading-fold${collapsed ? " is-collapsed" : ""}`;
  btn.setAttribute("contenteditable", "false");
  btn.setAttribute("aria-label", collapsed ? "Unfold heading" : "Fold heading");
  btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  btn.innerHTML = CHEVRON;
  btn.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleHeadingCollapsedAt({ state: view.state, view }, headingPos);
  });
  return btn;
}

function foldDecorations(doc: { descendants: (fn: (node: any, pos: number) => void) => void; nodeAt: (pos: number) => any }) {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const collapsed = Boolean(node.attrs.collapsed);
    decos.push(
      Decoration.widget(
        pos + 1,
        (view) => foldButton(view, pos, collapsed),
        { side: -1, ignoreSelection: true, key: `fold-${node.attrs.id ?? pos}` },
      ),
    );
    if (!collapsed) return;
    const range = collapsedSiblings(doc as never, pos);
    if (!range) return;
    let childPos = range.from;
    while (childPos < range.to) {
      const child = doc.nodeAt(childPos);
      if (!child) break;
      decos.push(
        Decoration.node(childPos, childPos + child.nodeSize, {
          class: "nw-folded-away",
          hidden: "true",
        }),
      );
      childPos += child.nodeSize;
    }
  });
  return DecorationSet.create(doc as never, decos);
}

export const HeadingFold = Extension.create({
  name: "headingFold",

  addGlobalAttributes() {
    return [
      {
        types: ["heading"],
        attributes: {
          collapsed: {
            default: false,
            keepOnSplit: false,
            parseHTML: (el) => (el as HTMLElement).getAttribute("data-collapsed") === "true",
            renderHTML: (attrs) => (attrs.collapsed ? { "data-collapsed": "true" } : {}),
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: headingFoldKey,
        props: {
          // Plugin types `DecorationSource` from a nested prosemirror-view copy.
          decorations: (state) => foldDecorations(state.doc) as never,
        },
      }),
    ];
  },
});
