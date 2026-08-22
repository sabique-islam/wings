import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, NodeSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  EMPTY_FIND_STATE,
  refreshFindState,
  stepMatchIndex,
  wouldEmptyReplaceAll,
  type FindMatch,
  type FindReplaceState,
} from "./findReplace";
import { displayTitleForPage } from "./pageRef";

export const findReplaceKey = new PluginKey("findReplace");

let findReplaceRevision = 0;
const findReplaceSubscribers = new Set<() => void>();

export function subscribeFindReplace(notify: () => void): () => void {
  findReplaceSubscribers.add(notify);
  return () => {
    findReplaceSubscribers.delete(notify);
  };
}

export function readFindReplaceRevision(): number {
  return findReplaceRevision;
}

function bumpFindReplace(): void {
  queueMicrotask(() => {
    findReplaceRevision += 1;
    for (const notify of findReplaceSubscribers) notify();
  });
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    findReplace: {
      findOpen: (opts?: { seedFromSelection?: boolean }) => ReturnType;
      findClose: () => ReturnType;
      findSetQuery: (query: string) => ReturnType;
      findToggleCase: () => ReturnType;
      findNext: () => ReturnType;
      findPrev: () => ReturnType;
      findReplaceCurrent: (replacement: string) => ReturnType;
      findReplaceAll: (replacement: string) => ReturnType;
    };
  }
}

function readFindState(state: { plugins?: unknown }): FindReplaceState {
  return (findReplaceKey.getState(state as never) as FindReplaceState | undefined) ?? EMPTY_FIND_STATE;
}

function findDecorations(doc: { nodeSize: number }, matches: FindMatch[], active: number) {
  const decos = matches.map((match, index) => {
    const className = index === active ? "nw-find-match is-current" : "nw-find-match";
    if (!match.replaceable) {
      return Decoration.node(match.from, match.to, { class: className });
    }
    return Decoration.inline(match.from, match.to, { class: className });
  });
  return DecorationSet.create(doc as never, decos);
}

function selectionForMatch(doc: { resolve: (pos: number) => { nodeAfter?: { isAtom?: boolean } } }, match: FindMatch) {
  if (doc.resolve(match.from).nodeAfter?.isAtom) {
    return NodeSelection.create(doc as never, match.from);
  }
  return TextSelection.create(doc as never, match.from, match.to);
}

function dispatchFind(
  state: {
    tr: {
      setMeta: (key: unknown, value: unknown) => any;
      setSelection: (sel: unknown) => any;
      scrollIntoView: () => any;
    };
    doc: { resolve: (pos: number) => { nodeAfter?: { isAtom?: boolean } } };
  },
  dispatch: ((tr: unknown) => void) | undefined,
  next: FindReplaceState,
  selectActive: boolean,
) {
  let tr = state.tr.setMeta(findReplaceKey, next);
  const match = selectActive ? next.matches[next.active] : null;
  if (match) {
    try {
      tr = tr.setSelection(selectionForMatch(state.doc, match)).scrollIntoView();
    } catch {
      // Some atoms reject a text selection; the highlight still moves.
    }
  }
  dispatch?.(tr);
}

function replaceMatch(
  tr: {
    delete: (from: number, to: number) => unknown;
    replaceWith: (from: number, to: number, node: unknown) => unknown;
  },
  schema: { text: (value: string) => unknown },
  match: FindMatch,
  replacement: string,
) {
  if (!match.replaceable) return tr;
  if (replacement.length === 0) return tr.delete(match.from, match.to);
  return tr.replaceWith(match.from, match.to, schema.text(replacement));
}

export function createFindReplaceExtension(getPages: () => Array<{ id: string; title: string }>) {
  const pageTitle = (pageId: string) => displayTitleForPage(pageId, getPages()).title;

  return Extension.create({
    name: "findReplace",
    // Above WritingExperience (200) and block selection (100) so Esc closes the
    // bar instead of selecting a block. Below slash/@ (500).
    priority: 300,

    addOptions() {
      return { getPages };
    },

    addCommands() {
      return {
        findOpen:
          (opts) =>
          ({ state, dispatch }) => {
            const current = readFindState(state);
            const selected =
              opts?.seedFromSelection && state.selection.from !== state.selection.to
                ? state.doc.textBetween(state.selection.from, state.selection.to, " ", " ")
                : "";
            const query = selected || current.query;
            if (!dispatch) return true;
            const next = refreshFindState(
              {
                ...current,
                open: true,
                query,
                selectionOnOpen: current.open
                  ? current.selectionOnOpen
                  : { from: state.selection.from, to: state.selection.to },
                focusNonce: current.focusNonce + 1,
                active: current.open && query === current.query ? current.active : 0,
              },
              state.doc,
              pageTitle,
            );
            dispatchFind(state, dispatch, next, true);
            return true;
          },

        findClose:
          () =>
          ({ editor, state, dispatch }) => {
            const current = readFindState(state);
            if (!current.open) return false;
            if (!dispatch) return true;
            let tr = state.tr.setMeta(findReplaceKey, { ...EMPTY_FIND_STATE, query: current.query });
            const restore = current.selectionOnOpen;
            if (restore && restore.to <= state.doc.content.size) {
              tr = tr.setSelection(TextSelection.create(state.doc as never, restore.from, restore.to));
            }
            dispatch(tr);
            editor.commands.focus();
            return true;
          },

        findSetQuery:
          (query) =>
          ({ state, dispatch }) => {
            const current = readFindState(state);
            if (!current.open) return false;
            if (!dispatch) return true;
            const next = refreshFindState({ ...current, query, active: 0 }, state.doc, pageTitle);
            dispatchFind(state, dispatch, next, false);
            return true;
          },

        findToggleCase:
          () =>
          ({ state, dispatch }) => {
            const current = readFindState(state);
            if (!current.open) return false;
            if (!dispatch) return true;
            const next = refreshFindState(
              { ...current, caseSensitive: !current.caseSensitive, active: 0 },
              state.doc,
              pageTitle,
            );
            dispatchFind(state, dispatch, next, false);
            return true;
          },

        findNext:
          () =>
          ({ state, dispatch }) => {
            const current = readFindState(state);
            if (!current.open || current.matches.length === 0) return false;
            if (!dispatch) return true;
            const active = stepMatchIndex(current.matches.length, current.active, 1);
            dispatchFind(state, dispatch, { ...current, active }, true);
            return true;
          },

        findPrev:
          () =>
          ({ state, dispatch }) => {
            const current = readFindState(state);
            if (!current.open || current.matches.length === 0) return false;
            if (!dispatch) return true;
            const active = stepMatchIndex(current.matches.length, current.active, -1);
            dispatchFind(state, dispatch, { ...current, active }, true);
            return true;
          },

        findReplaceCurrent:
          (replacement) =>
          ({ editor, state, dispatch }) => {
            const current = readFindState(state);
            if (!current.open || !editor.isEditable) return false;
            const match = current.matches[current.active];
            if (!match?.replaceable) return editor.commands.findNext();
            if (!dispatch) return true;
            const tr = replaceMatch(state.tr, state.schema, match, replacement) as typeof state.tr;
            const next = refreshFindState({ ...current, active: current.active }, tr.doc, pageTitle);
            dispatch(tr.setMeta(findReplaceKey, next));
            return true;
          },

        findReplaceAll:
          (replacement) =>
          ({ editor, state, dispatch }) => {
            const current = readFindState(state);
            if (!current.open || !editor.isEditable) return false;
            const replaceable = current.matches.filter((item) => item.replaceable);
            if (replaceable.length === 0) return false;
            if (wouldEmptyReplaceAll(state.doc, current.query, replacement, current.caseSensitive)) {
              return false;
            }
            if (!dispatch) return true;
            let tr = state.tr;
            for (let i = replaceable.length - 1; i >= 0; i--) {
              tr = replaceMatch(tr, state.schema, replaceable[i]!, replacement) as typeof tr;
            }
            const next = refreshFindState({ ...current, active: 0 }, tr.doc, pageTitle);
            dispatch(tr.setMeta(findReplaceKey, next));
            return true;
          },
      };
    },

    addKeyboardShortcuts() {
      return {
        "Mod-f": () => this.editor.commands.findOpen({ seedFromSelection: true }),
        "Mod-g": () => this.editor.commands.findNext(),
        "Shift-Mod-g": () => this.editor.commands.findPrev(),
        Escape: () => this.editor.commands.findClose(),
      };
    },

    addProseMirrorPlugins() {
      const titleOf = pageTitle;
      return [
        new Plugin({
          key: findReplaceKey,
          state: {
            init: () => EMPTY_FIND_STATE,
            apply(tr, value) {
              const meta = tr.getMeta(findReplaceKey) as FindReplaceState | undefined;
              const base = meta ?? value;
              if (!base.open) return meta ? base : value;
              if (meta && !tr.docChanged) return meta;
              return refreshFindState(base, tr.doc, titleOf);
            },
          },
          view() {
            return {
              update() {
                bumpFindReplace();
              },
              destroy() {
                bumpFindReplace();
              },
            };
          },
          props: {
            decorations: (state) => {
              const current = readFindState(state);
              if (!current.open || current.matches.length === 0) return null;
              return findDecorations(state.doc, current.matches, current.active) as never;
            },
          },
        }),
      ];
    },
  });
}

export const FindReplace = createFindReplaceExtension(() => []);
