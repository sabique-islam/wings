import type { Editor } from "@tiptap/core";
import type { TurnIntoType } from "./blockCommands";

/** Narrow phones, or any coarse (touch) pointer — hide the bubble, show the bar. */
export const KEYBOARD_TOOLBAR_MEDIA = "(max-width: 640px), (pointer: coarse)";

export const MOBILE_TURN_INTO: { label: string; type: TurnIntoType }[] = [
  { label: "Text", type: "paragraph" },
  { label: "Heading 1", type: "heading1" },
  { label: "Heading 2", type: "heading2" },
  { label: "Bullet list", type: "bulletList" },
  { label: "To-do", type: "taskList" },
];

export function shouldShowKeyboardToolbar(input: {
  width: number;
  pointerCoarse: boolean;
}): boolean {
  return input.width <= 640 || input.pointerCoarse;
}

/** Pixels from the bottom of the layout viewport to the top of the OS keyboard. */
export function keyboardToolbarOffset(
  viewport: { offsetTop: number; height: number },
  windowInnerHeight: number,
): number {
  return Math.max(0, Math.round(windowInnerHeight - viewport.offsetTop - viewport.height));
}

export function toggleToolbarMark(editor: Editor, mark: "bold" | "italic"): boolean {
  if (mark === "bold") return editor.chain().focus().toggleBold().run();
  return editor.chain().focus().toggleItalic().run();
}

/**
 * Insert `/` or `@` so the existing suggestion plugin opens.
 * Adds a leading space when the caret is mid-word — same rule as typing the char.
 */
export function insertSuggestionChar(editor: Editor, char: "/" | "@"): boolean {
  if (editor.state.selection.$from.parent.type.name === "codeBlock") return false;
  if (!editor.state.selection.empty) {
    editor.commands.setTextSelection(editor.state.selection.to);
  }
  const { $from } = editor.state.selection;
  const offset = $from.parentOffset;
  const before = offset > 0 ? $from.parent.textBetween(offset - 1, offset) : "";
  const prefix = offset === 0 || /\s/.test(before) ? "" : " ";
  return editor.chain().focus().insertContent(prefix + char).run();
}

export function preventEditorBlur(event: { preventDefault: () => void }): void {
  event.preventDefault();
}
