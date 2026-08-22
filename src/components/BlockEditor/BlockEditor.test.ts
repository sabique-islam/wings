// Regression tests for the TipTap editor configuration.
//
// These guard the BlockEditor against subtle extension conflicts that have
// previously broken the writing experience — most notably the StarterKit v3
// bundled Link extension colliding with our explicit Link, which swallowed
// Enter keystrokes and stopped markdown shortcuts from rendering.
//
// We boot the editor headlessly. We avoid splitBlock/Enter command paths in
// jsdom because the editor's view requires DOM ranges that jsdom does not
// implement — instead we assert the structural invariants that ensure Enter
// behaves correctly when the editor runs in a real browser.

import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import { slashCommandSuggestionKey, pageMentionSuggestionKey } from "./suggestionPluginKeys";
import { htmlToMarkdown, markdownToHtml } from "@/lib/markdown";

function makeEditor(content = "<p>hello</p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

function placeCursorAtEnd(editor: Editor) {
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
}

function textblockCount(editor: Editor, type: string) {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === type) count += 1;
  });
  return count;
}

function listItemTexts(editor: Editor): string[] {
  const texts: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "listItem") texts.push(node.textContent);
  });
  return texts;
}

function placeCursorInNthListItem(editor: Editor, index: number) {
  let seen = 0;
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name !== "listItem") return;
    if (seen === index) {
      pos = nodePos + 2;
      return false;
    }
    seen += 1;
  });
  if (pos == null) throw new Error(`list item ${index} not found`);
  editor.commands.setTextSelection(pos);
}

describe("BlockEditor wiring", () => {
  it("registers Link exactly once (no StarterKit duplicate)", () => {
    const editor = makeEditor();
    const linkCount = editor.extensionManager.extensions.filter((e) => e.name === "link").length;
    expect(linkCount).toBe(1);
    editor.destroy();
  });

  it("has paragraph + hardBreak + heading nodes wired up (needed for Enter)", () => {
    const editor = makeEditor();
    const schema = editor.schema;
    expect(schema.nodes.paragraph).toBeTruthy();
    expect(schema.nodes.hardBreak).toBeTruthy();
    expect(schema.nodes.heading).toBeTruthy();
    editor.destroy();
  });

  it("exposes splitBlock and enter commands (Enter keymap depends on them)", () => {
    const editor = makeEditor();
    expect(typeof (editor.commands as any).splitBlock).toBe("function");
    expect(typeof (editor.commands as any).enter).toBe("function");
    expect(editor.extensionManager.extensions.some((e) => e.name === "writingExperience")).toBe(true);
    editor.destroy();
  });

  it("keeps the writing guard above StarterKit nodes but below Suggestion plugins", () => {
    // Priority 200 is intentional: above StarterKit (100) so we own Enter and
    // Backspace, but below the Suggestion plugin (500) so the slash menu can
    // capture Enter while its popup is open. Priority 1000 (the old value)
    // stole Enter from the slash menu and inserted a stray newline.
    const editor = makeEditor();
    const writing = editor.extensionManager.extensions.find((e) => e.name === "writingExperience");
    expect(writing?.config.priority).toBe(200);
    editor.destroy();
  });

  it("getHTML stays in sync with multi-paragraph content (preview === stored)", () => {
    const editor = makeEditor("<p>a</p><p>b</p>");
    const html = editor.getHTML();
    expect(html).toMatch(/<p>a<\/p>\s*<p>b<\/p>/);
    editor.destroy();
  });

  it("setContent updates the doc so what AI receives matches what user sees", () => {
    const editor = makeEditor();
    editor.commands.setContent("<h1>Title</h1><p>body</p>");
    const html = editor.getHTML();
    expect(html).toMatch(/<h1[^>]*>Title<\/h1>/);
    expect(html).toMatch(/<p[^>]*>body<\/p>/);
    editor.destroy();
  });

  it("applies bold mark (mirrors **bold** input rule)", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.focus();
    editor.commands.toggleBold();
    editor.commands.insertContent("loud");
    expect(editor.getHTML()).toMatch(/<strong>loud<\/strong>/);
    editor.destroy();
  });

  it("can set a heading (mirrors `# ` markdown shortcut)", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.focus();
    editor.commands.setHeading({ level: 1 });
    editor.commands.insertContent("Title");
    expect(editor.getHTML()).toMatch(/<h1[^>]*>Title<\/h1>/);
    editor.destroy();
  });

  it("Enter has a schema-safe command path across the full active extension stack", () => {
    const editor = makeEditor("<p>alpha</p>");
    expect(editor.state.schema.nodes.taskItem).toBeTruthy();
    expect(editor.state.schema.nodes.listItem).toBeTruthy();
    expect(typeof (editor.commands as any).enter).toBe("function");
    expect(typeof (editor.commands as any).splitBlock).toBe("function");
    editor.destroy();
  });

  it("Shift+Enter inserts a hard break inside the current paragraph", () => {
    const editor = makeEditor("<p>alpha</p>");
    placeCursorAtEnd(editor);

    expect(editor.commands.keyboardShortcut("Shift-Enter")).toBe(true);
    editor.commands.insertContent("beta");

    expect(textblockCount(editor, "paragraph")).toBeGreaterThanOrEqual(1);
    expect(editor.getHTML()).toMatch(/alpha<br\s*\/?>beta/);
    expect(htmlToMarkdown(editor.getHTML())).toBe("alpha  \nbeta");
    editor.destroy();
  });

  it("multi-line paste inside a code block stays in the fence", () => {
    const editor = makeEditor("<p></p>");
    editor.chain().focus().setCodeBlock().run();

    const pasted = "class Solution {\npublic:\n    int x;\n};";
    editor.view.dispatch(editor.state.tr.insertText(pasted));

    expect(textblockCount(editor, "codeBlock")).toBe(1);
    expect(editor.state.doc.textContent).toContain("class Solution");
    expect(editor.state.doc.textContent).toContain("public:");
    editor.destroy();
  });

  it("Markdown shortcut input rules are active for live browser typing", () => {
    const editor = makeEditor("<p></p>");
    expect(editor.extensionManager.extensions.some((e) => e.name === "heading" && typeof e.config.addInputRules === "function")).toBe(true);
    expect(editor.extensionManager.extensions.some((e) => e.name === "bulletList" && typeof e.config.addInputRules === "function")).toBe(true);
    expect(editor.extensionManager.extensions.some((e) => e.name === "bold" && typeof e.config.addInputRules === "function")).toBe(true);
    expect(editor.extensionManager.extensions.some((e) => e.name === "codeBlock" && typeof e.config.addInputRules === "function")).toBe(true);
    editor.destroy();
  });

  it("stored text, Markdown preview, and AI-request text stay identical after every edit", () => {
    const editor = makeEditor("<p></p>");
    const edits = [
      () => editor.commands.insertContent("alpha"),
      () => editor.commands.setContent("<p>alpha</p><p></p>"),
      () => editor.commands.insertContent("beta"),
      () => editor.commands.keyboardShortcut("Shift-Enter"),
      () => editor.commands.insertContent("gamma"),
      () => editor.commands.setContent(editor.getHTML() + "<p></p>"),
      () => editor.commands.insertContent("**bold**"),
    ];

    for (const edit of edits) {
      expect(edit()).toBe(true);
      const storedText = htmlToMarkdown(editor.getHTML());
      const markdownPreview = htmlToMarkdown(editor.getHTML());
      const aiRequestText = htmlToMarkdown(editor.getHTML());
      expect(markdownPreview).toBe(storedText);
      expect(aiRequestText).toBe(storedText);
    }

    editor.destroy();
  });

  it("registers uniqueID for stable block identity", () => {
    const editor = makeEditor();
    expect(editor.extensionManager.extensions.some((e) => e.name === "uniqueID")).toBe(true);
    editor.destroy();
  });

  it("registers trailingNode for Notion-style bottom paragraph", () => {
    const editor = makeEditor();
    expect(editor.extensionManager.extensions.some((e) => e.name === "trailingNode")).toBe(true);
    editor.destroy();
  });

  it("registers underline mark for bubble menu", () => {
    const editor = makeEditor();
    expect(editor.extensionManager.extensions.some((e) => e.name === "underline")).toBe(true);
    editor.commands.toggleUnderline();
    editor.commands.insertContent("under");
    expect(editor.getHTML()).toMatch(/<u>under<\/u>/);
    editor.destroy();
  });

  it("registers toggleBlock node for Tab-nest and UniqueID", () => {
    const editor = makeEditor();
    expect(editor.state.schema.nodes.toggleBlock).toBeTruthy();
    const uniqueId = editor.extensionManager.extensions.find((e) => e.name === "uniqueID");
    expect(uniqueId).toBeTruthy();
    editor.destroy();
  });

  it("registers blockSelection", () => {
    const editor = makeEditor();
    expect(editor.extensionManager.extensions.some((e) => e.name === "blockSelection")).toBe(true);
    editor.destroy();
  });

  it("leaves emDash off so --- Enter can become a divider", () => {
    const editor = makeEditor();
    const typography = editor.extensionManager.extensions.find((e) => e.name === "typography");
    expect(typography?.options.emDash).toBe(false);
    editor.destroy();
  });

  it("registers slash + page mention suggestion plugins with distinct keys", () => {
    const editor = new Editor({
      extensions: createBlockEditorExtensions({
        getPages: () => [{ id: "1", title: "Test page" }],
      }),
      content: "<p></p>",
    });
    const slashKey = editor.state.plugins.find((p) => p.spec.key === slashCommandSuggestionKey)?.spec.key;
    const pageKey = editor.state.plugins.find((p) => p.spec.key === pageMentionSuggestionKey)?.spec.key;
    expect(slashKey).toBe(slashCommandSuggestionKey);
    expect(pageKey).toBe(pageMentionSuggestionKey);
    editor.destroy();
  });

  it("registers slash suggestion under a dedicated plugin key", () => {
    const editor = makeEditor("<p></p>");
    const slashKey = editor.state.plugins.find((p) => p.spec.key === slashCommandSuggestionKey)?.spec.key;
    expect(slashKey).toBe(slashCommandSuggestionKey);
    editor.destroy();
  });

  it("activates slash suggestion when typing /callout", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.focus();
    editor.commands.insertContent("/callout");
    const suggestionState = slashCommandSuggestionKey.getState(editor.state) as { active?: boolean } | undefined;
    expect(suggestionState?.active).toBe(true);
    editor.destroy();
  });

  it("Backspace on an empty last list item does not delete the list", () => {
    const editor = makeEditor(
      "<h2>Red Flags</h2><ul><li><p>first</p></li><li><p>second</p></li><li><p></p></li></ul>",
    );
    placeCursorInNthListItem(editor, 2);

    editor.commands.keyboardShortcut("Backspace");

    expect(textblockCount(editor, "bulletList")).toBe(1);
    expect(listItemTexts(editor)).toEqual(["first", "second"]);
    expect(editor.getHTML()).toMatch(/<h2[^>]*>Red Flags<\/h2>/);
    editor.destroy();
  });

  it("Backspace on an empty middle list item keeps the other bullets", () => {
    const editor = makeEditor(
      "<h2>Red Flags</h2><ul><li><p>first</p></li><li><p></p></li><li><p>third</p></li></ul>",
    );
    placeCursorInNthListItem(editor, 1);

    editor.commands.keyboardShortcut("Backspace");

    expect(textblockCount(editor, "bulletList")).toBeGreaterThanOrEqual(1);
    expect(listItemTexts(editor)).toContain("first");
    expect(editor.state.doc.textContent).toContain("first");
    expect(editor.state.doc.textContent).toContain("third");
    expect(editor.getHTML()).toMatch(/<h2[^>]*>Red Flags<\/h2>/);
    editor.destroy();
  });

  it("Backspace on an empty paragraph still merges upward outside lists", () => {
    const editor = makeEditor("<p>hello</p><p></p>");
    let emptyPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph" && node.textContent === "" && emptyPos == null) {
        emptyPos = pos + 1;
        return false;
      }
    });
    expect(emptyPos).not.toBeNull();
    editor.commands.setTextSelection(emptyPos!);

    editor.commands.keyboardShortcut("Backspace");

    expect(editor.state.doc.textContent).toContain("hello");
    const filledParagraphs: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "paragraph" && node.textContent === "hello") {
        filledParagraphs.push(node.textContent);
      }
    });
    expect(filledParagraphs).toHaveLength(1);
    editor.destroy();
  });

  it("parses ChatGPT-normalized markdown into blockMath nodes", () => {
    const paste = `If you mean an integration-by-parts equation:

[
\\boxed{\\int u,dv = uv-\\int v,du}
]

Example:

[
\\int x e^x,dx = xe^x-\\int e^x,dx = e^x(x-1)+C
]
`;
    const editor = makeEditor(markdownToHtml(paste));
    const math: { latex: string }[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "blockMath") math.push({ latex: node.attrs.latex });
    });
    expect(math).toHaveLength(2);
    expect(math[0]?.latex).toContain("\\boxed{");
    expect(math[0]?.latex).toContain("\\int u\\,dv");
    expect(math[1]?.latex).toContain("e^x\\,dx");
    expect(htmlToMarkdown(editor.getHTML())).toContain("$$");
    editor.destroy();
  });

  it("loads $x^2$ and \\[a^2\\] as math nodes", () => {
    const inlineEditor = makeEditor(markdownToHtml("an $x^2$ token"));
    let inline = 0;
    inlineEditor.state.doc.descendants((node) => {
      if (node.type.name === "inlineMath" && node.attrs.latex === "x^2") inline += 1;
    });
    expect(inline).toBe(1);
    inlineEditor.destroy();

    const blockEditor = makeEditor(markdownToHtml("\\[a^2\\]"));
    let block = 0;
    blockEditor.state.doc.descendants((node) => {
      if (node.type.name === "blockMath" && node.attrs.latex === "a^2") block += 1;
    });
    expect(block).toBe(1);
    expect(typeof blockEditor.extensionManager.extensions.find((e) => e.name === "blockMath")?.config.addInputRules).toBe("function");
    expect(typeof blockEditor.extensionManager.extensions.find((e) => e.name === "inlineMath")?.config.addInputRules).toBe("function");
    blockEditor.destroy();
  });
});
