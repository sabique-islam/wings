import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import { focusEndOfPage } from "./focusEndOfPage";
import { isEmptyDoc } from "@/lib/editorContent";

function makeEditor(content: string) {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

describe("focusEndOfPage", () => {
  it("focuses an existing empty last paragraph without inserting another", () => {
    const editor = makeEditor("<p>hello</p><p></p>");
    const before = editor.state.doc.childCount;
    expect(focusEndOfPage(editor)).toBe(true);
    expect(editor.state.doc.childCount).toBe(before);
    expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
    expect(editor.state.doc.lastChild?.content.size).toBe(0);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    editor.destroy();
  });

  it("inserts an empty paragraph after a filled last block", () => {
    const editor = makeEditor("<p>hello</p>");
    expect(focusEndOfPage(editor)).toBe(true);
    expect(editor.state.doc.childCount).toBeGreaterThanOrEqual(2);
    expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
    expect(editor.state.doc.lastChild?.content.size).toBe(0);
    expect(editor.state.doc.textContent).toContain("hello");
    expect(isEmptyDoc(editor.getJSON())).toBe(false);
    editor.destroy();
  });

  it("does nothing when the editor is not editable", () => {
    const editor = makeEditor("<p>hello</p>");
    editor.setEditable(false);
    const before = editor.state.doc.childCount;
    expect(focusEndOfPage(editor)).toBe(false);
    expect(editor.state.doc.childCount).toBe(before);
    editor.destroy();
  });
});
