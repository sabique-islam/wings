import { PluginKey, type EditorState } from "@tiptap/pm/state";

export const blockSelectionKey = new PluginKey("blockSelection");

export interface BlockSelectionState {
  positions: number[];
  anchor: number | null;
}

export const EMPTY_BLOCK_SELECTION: BlockSelectionState = { positions: [], anchor: null };

export function getSelectedBlockPositions(state: EditorState): number[] {
  const pluginState = blockSelectionKey.getState(state) as BlockSelectionState | undefined;
  return pluginState?.positions ?? [];
}

export function getBlockSelectionState(state: EditorState): BlockSelectionState {
  return (blockSelectionKey.getState(state) as BlockSelectionState) ?? EMPTY_BLOCK_SELECTION;
}

export function sameBlockPositions(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((pos, i) => pos === right[i]);
}
