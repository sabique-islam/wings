import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import { htmlToMarkdown, markdownToHtml } from "@/lib/markdown";
import { displayTitleForPage, PAGE_REF_NODE } from "./pageRef";
import { wikiLinkFullwidthSuggestionKey, wikiLinkSuggestionKey } from "./suggestionPluginKeys";

function makeEditor(
  content: string | object = "<p></p>",
  pages: Array<{ id: string; title: string }> = [{ id: "p1", title: "Reading" }],
) {
  return new Editor({
    extensions: createBlockEditorExtensions({ getPages: () => pages }),
    content,
  });
}

function pageRefCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === PAGE_REF_NODE) count += 1;
  });
  return count;
}

describe("displayTitleForPage", () => {
  it("uses the live title from the page list", () => {
    expect(displayTitleForPage("p1", [{ id: "p1", title: "Books" }])).toEqual({
      title: "Books",
      missing: false,
    });
  });

  it("marks a missing page without inventing a stored label", () => {
    expect(displayTitleForPage("gone", [{ id: "p1", title: "Books" }])).toEqual({
      title: "Untitled",
      missing: true,
    });
  });
});

describe("pageRef editor", () => {
  it("registers the pageRef node", () => {
    const editor = makeEditor();
    expect(editor.state.schema.nodes.pageRef).toBeTruthy();
    editor.destroy();
  });

  it("registers both wikilink suggestion keys", () => {
    const editor = makeEditor();
    const bracket = editor.state.plugins.find((p) => p.spec.key === wikiLinkSuggestionKey)?.spec.key;
    const fullwidth = editor.state.plugins.find((p) => p.spec.key === wikiLinkFullwidthSuggestionKey)?.spec.key;
    expect(bracket).toBe(wikiLinkSuggestionKey);
    expect(fullwidth).toBe(wikiLinkFullwidthSuggestionKey);
    editor.destroy();
  });

  it("serializes the live title and keeps the page id", () => {
    const pages = [{ id: "p1", title: "Reading" }];
    const editor = makeEditor("<p></p>", pages);
    editor.commands.insertContent({ type: PAGE_REF_NODE, attrs: { pageId: "p1" } });
    expect(htmlToMarkdown(editor.getHTML())).toBe("[Reading](#page:p1)");

    pages[0] = { id: "p1", title: "Bookshelf" };
    const jsonBefore = editor.getJSON();
    expect(htmlToMarkdown(editor.getHTML())).toBe("[Bookshelf](#page:p1)");
    expect(editor.getJSON()).toEqual(jsonBefore);
    expect(JSON.stringify(jsonBefore)).toContain('"pageId":"p1"');
    expect(JSON.stringify(jsonBefore)).not.toContain("Bookshelf");
    editor.destroy();
  });

  it("loads a markdown page link as a pageRef showing the current title", () => {
    const editor = makeEditor(markdownToHtml("[Old Name](#page:p1)"), [
      { id: "p1", title: "Now" },
    ]);
    expect(pageRefCount(editor)).toBe(1);
    expect(htmlToMarkdown(editor.getHTML())).toBe("[Now](#page:p1)");
    editor.destroy();
  });

  it("lifts a saved link mark into a pageRef without dropping neighboring text", () => {
    const editor = makeEditor(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "see " },
              {
                type: "text",
                text: "Old",
                marks: [{ type: "link", attrs: { href: "#page:p1" } }],
              },
              { type: "text", text: " later" },
            ],
          },
        ],
      },
      [{ id: "p1", title: "Now" }],
    );
    expect(pageRefCount(editor)).toBe(1);
    expect(htmlToMarkdown(editor.getHTML())).toBe("see [Now](#page:p1) later");
    editor.destroy();
  });
});
