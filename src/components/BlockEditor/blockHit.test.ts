import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import {
  topLevelBlockPosFromCoordInfo,
  type CoordDoc,
} from "./blockHit";
import { deleteBlocksAtPositions } from "./blockUtils";

function makeEditor(content = '<p>hi</p><div data-type="block-math" data-latex="x^2"></div>') {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

function childPos(editor: Editor, type: string): number {
  let found: number | null = null;
  editor.state.doc.forEach((node, offset) => {
    if (found == null && node.type.name === type) found = offset;
  });
  if (found == null) throw new Error(`no ${type}`);
  return found;
}

describe("topLevelBlockPosFromCoordInfo", () => {
  it("finds a blockMath atom from a document-level gap", () => {
    const editor = makeEditor();
    const mathPos = childPos(editor, "blockMath");
    const doc = editor.state.doc as unknown as CoordDoc;
    expect(topLevelBlockPosFromCoordInfo(doc, { pos: mathPos, inside: -1 })).toBe(mathPos);
    const size = editor.state.doc.nodeAt(mathPos)!.nodeSize;
    expect(topLevelBlockPosFromCoordInfo(doc, { pos: mathPos + size, inside: -1 })).toBe(mathPos);
    editor.destroy();
  });

  it("still finds a paragraph from an inside text position", () => {
    const editor = makeEditor();
    const paraPos = childPos(editor, "paragraph");
    const doc = editor.state.doc as unknown as CoordDoc;
    expect(topLevelBlockPosFromCoordInfo(doc, { pos: paraPos + 1, inside: paraPos + 1 })).toBe(paraPos);
    editor.destroy();
  });

  it("deleteBlocksAtPositions removes the equation", () => {
    const editor = makeEditor();
    const mathPos = childPos(editor, "blockMath");
    expect(deleteBlocksAtPositions(editor, [mathPos])).toBe(true);
    let remaining = 0;
    editor.state.doc.forEach((node) => {
      if (node.type.name === "blockMath") remaining += 1;
    });
    expect(remaining).toBe(0);
    expect(editor.getText()).toContain("hi");
    editor.destroy();
  });
});
