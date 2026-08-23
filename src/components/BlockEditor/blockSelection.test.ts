import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import { getDocChildBlockPositions, type BlockDoc } from "./blockUtils";
import { getSelectedBlockPositions } from "./blockSelectionKey";
import { markdownForCopy, resolveCopyRange } from "./copyMarkdown";

function makeEditor(content = "<p>alpha</p><p>bravo</p><p>charlie</p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

function childPositions(editor: Editor): number[] {
  return getDocChildBlockPositions(editor.state.doc as BlockDoc);
}

describe("block selection plugin", () => {
  it("keeps plugin positions without stacking a node selection", () => {
    const editor = makeEditor();
    const [a, b] = childPositions(editor);
    editor.commands.setBlockSelection([a!, b!], a);
    expect(getSelectedBlockPositions(editor.state)).toEqual([a, b]);
    expect(editor.state.selection.empty).toBe(true);
    editor.destroy();
  });

  it("copies every selected block, not just the caret's", () => {
    const editor = makeEditor();
    const [a, b] = childPositions(editor);
    editor.commands.setTextSelection(1);
    editor.commands.setBlockSelection([a!, b!], a);
    const range = resolveCopyRange(editor, "auto");
    expect(range.from).toBe(a);
    expect(range.to).toBeGreaterThan(b!);
    const md = markdownForCopy(editor, "auto");
    expect(md).toContain("alpha");
    expect(md).toContain("bravo");
    expect(md).not.toContain("charlie");
    editor.destroy();
  });

  it("deletes the selected blocks when typing", () => {
    const editor = makeEditor();
    const [a, b] = childPositions(editor);
    editor.commands.setBlockSelection([a!, b!], a);
    const handled = editor.view.someProp("handleTextInput", (handle) => {
      if (handle(editor.view, 1, 1, "x")) return true;
    });
    expect(handled).toBe(true);
    expect(getSelectedBlockPositions(editor.state)).toEqual([]);
    expect(editor.getText()).not.toContain("alpha");
    expect(editor.getText()).not.toContain("bravo");
    expect(editor.getText()).toContain("x");
    expect(editor.getText()).toContain("charlie");
    editor.destroy();
  });

  it("records the current block so arrows can walk it", () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(1);
    const current = childPositions(editor)[0]!;
    expect(editor.commands.setBlockSelection([current], current)).toBe(true);
    expect(getSelectedBlockPositions(editor.state)).toEqual([current]);
    expect(editor.commands.clearBlockSelection()).toBe(true);
    expect(getSelectedBlockPositions(editor.state)).toEqual([]);
    editor.destroy();
  });
});
