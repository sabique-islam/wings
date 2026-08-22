import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import { htmlToMarkdown } from "@/lib/markdown";

function makeEditor(content: string | object = "<p></p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

function findCodeBlock(editor: Editor) {
  let found: { attrs: Record<string, unknown>; text: string } | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "codeBlock") {
      found = { attrs: { ...node.attrs }, text: node.textContent };
      return false;
    }
  });
  return found;
}

const LONG_SOURCE = ["line one", "line two", "line three", "line four", "line five"].join("\n");

describe("code block wrap and collapse", () => {
  it("registers wrap and collapsed attributes", () => {
    const editor = makeEditor();
    const spec = editor.state.schema.nodes.codeBlock.spec.attrs;
    expect(spec?.wrap).toBeTruthy();
    expect(spec?.collapsed).toBeTruthy();
    editor.destroy();
  });

  it("keeps wrap in JSON after a reload", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "javascript", wrap: true },
          content: [{ type: "text", text: "const a = 1;" }],
        },
      ],
    });
    expect(findCodeBlock(editor)?.attrs.wrap).toBe(true);

    const json = editor.getJSON();
    editor.destroy();

    const reloaded = makeEditor(json);
    const code = findCodeBlock(reloaded);
    expect(code?.attrs.wrap).toBe(true);
    expect(code?.text).toBe("const a = 1;");
    reloaded.destroy();
  });

  it("keeps the full source in JSON when collapsed", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "javascript" },
          content: [{ type: "text", text: LONG_SOURCE }],
        },
      ],
    });
    editor.commands.updateAttributes("codeBlock", { collapsed: true });
    expect(findCodeBlock(editor)?.attrs.collapsed).toBe(true);
    expect(findCodeBlock(editor)?.text).toBe(LONG_SOURCE);

    const json = editor.getJSON();
    editor.destroy();

    const reloaded = makeEditor(json);
    const code = findCodeBlock(reloaded);
    expect(code?.attrs.collapsed).toBe(true);
    expect(code?.text).toBe(LONG_SOURCE);
    expect(htmlToMarkdown(reloaded.getHTML())).toContain("line five");
    reloaded.destroy();
  });
});

describe("mermaid fences", () => {
  const source = "flowchart TD\n  A-->B";

  it("still serializes the fence when a preview would throw", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text: "this is not a diagram" }],
        },
      ],
    });
    const markdown = htmlToMarkdown(editor.getHTML());
    expect(markdown).toContain("```mermaid");
    expect(markdown).toContain("this is not a diagram");
    expect(findCodeBlock(editor)?.text).toBe("this is not a diagram");
    editor.destroy();
  });

  it("round-trips a flowchart as a mermaid fence", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text: source }],
        },
      ],
    });
    const markdown = htmlToMarkdown(editor.getHTML());
    expect(markdown).toContain("```mermaid");
    expect(markdown).toContain("A-->B");
    editor.destroy();
  });
});
