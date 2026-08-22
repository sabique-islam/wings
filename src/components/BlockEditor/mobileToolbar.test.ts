import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import { slashCommandSuggestionKey, pageMentionSuggestionKey } from "./suggestionPluginKeys";
import { indentCurrentBlock } from "./outlineNest";
import {
  insertSuggestionChar,
  keyboardToolbarOffset,
  preventEditorBlur,
  shouldShowKeyboardToolbar,
  toggleToolbarMark,
} from "./mobileToolbar";

function makeEditor(content = "<p>hello</p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

function placeCursorInParagraph(editor: Editor, text: string) {
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === "paragraph" && node.textContent === text) {
      pos = nodePos + 1;
      return false;
    }
  });
  if (pos == null) throw new Error(`paragraph "${text}" not found`);
  editor.commands.setTextSelection(pos);
}

describe("keyboard toolbar visibility", () => {
  it("shows on a phone-width viewport", () => {
    expect(shouldShowKeyboardToolbar({ width: 390, pointerCoarse: false })).toBe(true);
  });

  it("hides on a desktop pointer", () => {
    expect(shouldShowKeyboardToolbar({ width: 1280, pointerCoarse: false })).toBe(false);
  });

  it("shows on a coarse pointer even when the viewport is wide", () => {
    expect(shouldShowKeyboardToolbar({ width: 1024, pointerCoarse: true })).toBe(true);
  });
});

describe("keyboardToolbarOffset", () => {
  it("is the gap between the layout viewport and the visual viewport", () => {
    expect(keyboardToolbarOffset({ offsetTop: 0, height: 500 }, 800)).toBe(300);
  });

  it("is zero when the keyboard is closed", () => {
    expect(keyboardToolbarOffset({ offsetTop: 0, height: 800 }, 800)).toBe(0);
  });

  it("accounts for a scrolled visual viewport", () => {
    expect(keyboardToolbarOffset({ offsetTop: 50, height: 500 }, 800)).toBe(250);
  });
});

describe("toolbar commands", () => {
  it("bold toggles the mark on the current selection", () => {
    const editor = makeEditor("<p>hello</p>");
    editor.commands.selectAll();
    expect(toggleToolbarMark(editor, "bold")).toBe(true);
    expect(editor.isActive("bold")).toBe(true);
    toggleToolbarMark(editor, "bold");
    expect(editor.isActive("bold")).toBe(false);
    editor.destroy();
  });

  it("inserts / after a word so the slash menu can open", () => {
    const editor = makeEditor("<p>hello</p>");
    editor.commands.focus("end");
    expect(insertSuggestionChar(editor, "/")).toBe(true);
    expect(editor.state.doc.textContent).toBe("hello /");
    const suggestionState = slashCommandSuggestionKey.getState(editor.state) as
      | { active?: boolean }
      | undefined;
    expect(suggestionState?.active).toBe(true);
    editor.destroy();
  });

  it("inserts / alone in an empty paragraph", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.focus();
    insertSuggestionChar(editor, "/");
    expect(editor.state.doc.textContent).toBe("/");
    const suggestionState = slashCommandSuggestionKey.getState(editor.state) as
      | { active?: boolean }
      | undefined;
    expect(suggestionState?.active).toBe(true);
    editor.destroy();
  });

  it("inserts @ to open page mentions", () => {
    const editor = new Editor({
      extensions: createBlockEditorExtensions({
        getPages: () => [{ id: "page-reading-list", title: "Reading List" }],
      }),
      content: "<p></p>",
    });
    editor.commands.focus();
    insertSuggestionChar(editor, "@");
    const mentionState = pageMentionSuggestionKey.getState(editor.state) as
      | { active?: boolean }
      | undefined;
    expect(mentionState?.active).toBe(true);
    editor.destroy();
  });

  it("does not insert a trigger inside a code block", () => {
    const editor = makeEditor("<pre><code>fn()</code></pre>");
    editor.commands.focus();
    expect(insertSuggestionChar(editor, "/")).toBe(false);
    expect(editor.state.doc.textContent).toBe("fn()");
    editor.destroy();
  });

  it("indent nests a paragraph under the previous one", () => {
    const editor = makeEditor("<p>hello</p><p>world</p>");
    placeCursorInParagraph(editor, "world");
    expect(indentCurrentBlock(editor)).toBe(true);
    expect(editor.state.doc.firstChild?.type.name).toBe("outlineBlock");
    editor.destroy();
  });

  it("mousedown handler keeps the editor from blurring", () => {
    let called = false;
    preventEditorBlur({ preventDefault: () => { called = true; } });
    expect(called).toBe(true);
  });
});
