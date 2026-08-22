import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
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

function patchFind(
  state: { tr: { setMeta: (key: unknown, value: unknown) => unknown }; doc: Parameters<typeof refreshFindState>[1] },
  current: FindReplaceState,
  patch: Partial<FindReplaceState>,
  pageTitle: (pageId: string) => string,
) {
  const next = refreshFindState({ ...current, ...patch }, state.doc, pageTitle);
  return (state.tr as { setMeta: (key: unknown, value: unknown) => { scrollIntoView?: () => unknown } }).setMeta(
    findReplaceKey,
    next,
  );
}

function selectMatch(
  editor: {
    state: { doc: { resolve: (pos: number) => { nodeAfter?: { isAtom?: boolean } }; content: { size: number } } };
    commands: {
      setTextSelection: (range: { from: number; to: number }) => boolean;
      setNodeSelection: (pos: number) => boolean;
    };
    view: { dispatch: (tr: { scrollIntoView: () => unknown }) => void; state: { tr: { scrollIntoView: () => unknown } } };
  },
  match: FindMatch,
) {
  const nodeAfter = editor.state.doc.resolve(match.from).nodeAfter;
  if (nodeAfter?.isAtom) editor.commands.setNodeSelection(match.from);
  else editor.commands.setTextSelection({ from: match.from, to: match.to });
  editor.view.dispatch(editor.view.state.tr.scrollIntoView() as never);
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
          ({ editor, state, dispatch }) => {
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
            dispatch(state.tr.setMeta(findReplaceKey, next));
            const match = next.matches[next.active];
            if (match) selectMatch(editor as never, match);
            return true;
          },

        findClose:
          () =>
          ({ editor, state, dispatch }) => {
            const current = readFindState(state);
            if (!current.open) return false;
            if (!dispatch) return true;
            dispatch(state.tr.setMeta(findReplaceKey, { ...EMPTY_FIND_STATE, query: current.query }));
            const restore = current.selectionOnOpen;
            if (restore && restore.to <= state.doc.content.size) {
              editor.commands.setTextSelection(restore);
            }
            editor.commands.focus();
            return true;
          },

        findSetQuery:
          (query) =>
          ({ state, dispatch }) => {
            const current = readFindState(state);
            if (!current.open) return false;
            if (!dispatch) return true;
            dispatch(
              patchFind(state, current, { query, active: 0 }, pageTitle) as never,
            );
            return true;
          },

        findToggleCase:
          () =>
          ({ state, dispatch }) => {
            const current = readFindState(state);
            if (!current.open) return false;
            if (!dispatch) return true;
            dispatch(
              patchFind(
                state,
                current,
                { caseSensitive: !current.caseSensitive, active: 0 },
                pageTitle,
              ) as never,
            );
            return true;
          },

        findNext:
          () =>
          ({ editor, state, dispatch }) => {
            const current = readFindState(state);
            if (!current.open || current.matches.length === 0) return false;
            if (!dispatch) return true;
            const active = stepMatchIndex(current.matches.length, current.active, 1);
            dispatch(state.tr.setMeta(findReplaceKey, { ...current, active }));
            const match = current.matches[active];
            if (match) selectMatch(editor as never, match);
            return true;
          },

        findPrev:
          () =>
          ({ editor, state, dispatch }) => {
            const current = readFindState(state);
            if (!current.open || current.matches.length === 0) return false;
            if (!dispatch) return true;
            const active = stepMatchIndex(current.matches.length, current.active, -1);
            dispatch(state.tr.setMeta(findReplaceKey, { ...current, active }));
            const match = current.matches[active];
            if (match) selectMatch(editor as never, match);
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
            const next = refreshFindState(
              { ...current, active: current.active },
              tr.doc,
              pageTitle,
            );
            dispatch(tr.setMeta(findReplaceKey, next));
            const follow = next.matches[next.active];
            if (follow) selectMatch(editor as never, follow);
            return true;
          },

        findReplaceAll:
          (replacement) =>
          ({ editor, state, dispatch }) => {
            const current = readFindState(state);
            if (!current.open || !editor.isEditable) return false;
            const replaceable = current.matches.filter((match) => match.replaceable);
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
