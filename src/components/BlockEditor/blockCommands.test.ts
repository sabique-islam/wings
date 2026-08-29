import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import {
  extractSingleLinkFromHtml,
  pasteExternalUrlAsLink,
  insertBookmark,
  updateBookmarkMeta,
  bookmarkNeedsPreview,
  moveBlock,
  duplicateBlock,
  deleteCurrentBlock,
} from "./blockCommands";

function makeEditor(content = "<p></p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

function bookmarkCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "bookmark") count += 1;
  });
  return count;
}

describe("extractSingleLinkFromHtml", () => {
  it("reads a single anchor from typical clipboard HTML", () => {
    const html =
      "<meta charset='utf-8'><a href=\"https://github.com/org/repo\">https://github.com/org/repo</a>";
    expect(extractSingleLinkFromHtml(html)).toBe("https://github.com/org/repo");
  });

  it("ignores html with multiple links", () => {
    const html = '<a href="https://a.com">a</a><a href="https://b.com">b</a>';
    expect(extractSingleLinkFromHtml(html)).toBeNull();
  });
});

describe("pasteExternalUrlAsLink", () => {
  it("inserts an inline link into an empty paragraph, not a bookmark", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.focus();
    const url = "https://github.com/org/repo";
    expect(pasteExternalUrlAsLink(editor, url)).toBe(true);
    expect(bookmarkCount(editor)).toBe(0);
    expect(editor.state.doc.textContent).toContain("github.com/org");
    expect(editor.isActive("link")).toBe(true);
    expect(String(editor.getAttributes("link").href)).toContain("github.com/org/repo");
    editor.destroy();
  });

  it("keeps surrounding text when the caret is mid-paragraph", () => {
    const editor = makeEditor("<p>see  here</p>");
    editor.commands.setTextSelection(5);
    const url = "https://github.com/org/repo";
    expect(pasteExternalUrlAsLink(editor, url)).toBe(true);
    expect(bookmarkCount(editor)).toBe(0);
    expect(editor.state.doc.textContent).toContain("see");
    expect(editor.state.doc.textContent).toContain("here");
    expect(editor.state.doc.textContent).toContain(url);
    editor.destroy();
  });

  it("applies the href to the selected text", () => {
    const editor = makeEditor("<p>hello</p>");
    editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(pasteExternalUrlAsLink(editor, "https://github.com/org/repo")).toBe(true);
    expect(bookmarkCount(editor)).toBe(0);
    expect(editor.state.doc.textContent).toBe("hello");
    expect(String(editor.getAttributes("link").href)).toContain("github.com/org/repo");
    editor.destroy();
  });

  it("rejects javascript: urls", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.focus();
    expect(pasteExternalUrlAsLink(editor, "javascript:alert(1)")).toBe(false);
    expect(editor.state.doc.textContent).toBe("");
    editor.destroy();
  });
});

describe("insertBookmark + updateBookmarkMeta", () => {
  it("inserts one bookmark and patches metadata by url, not position", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.focus();
    const url = "https://github.com/org/repo";
    expect(insertBookmark(editor, url)).toBe(true);
    expect(bookmarkCount(editor)).toBe(1);
    expect(updateBookmarkMeta(editor, url, {
      title: "My Repo",
      description: "Notes",
      image: "https://example.com/og.png",
      favicon: "https://github.com/favicon.ico",
    })).toBe(true);
    expect(bookmarkCount(editor)).toBe(1);
    let found: { title: string; url: string } | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "bookmark") found = { title: node.attrs.title, url: node.attrs.url };
    });
    expect(found).toEqual({ title: "My Repo", url });
    editor.destroy();
  });

  it("reads data-url from HTML and writes it back", () => {
    const editor = makeEditor('<div data-type="bookmark" data-url="https://a.com" data-title="Alpha"></div>');
    let url = "";
    editor.state.doc.descendants((node) => {
      if (node.type.name === "bookmark") url = node.attrs.url;
    });
    expect(url).toBe("https://a.com");
    expect(editor.getHTML()).toContain("data-url=\"https://a.com\"");
    editor.destroy();
  });
});

describe("bookmarkNeedsPreview", () => {
  it("is true for hostname-only titles and false once OG data exists", () => {
    expect(bookmarkNeedsPreview({ url: "https://github.com/org/repo", title: "github.com" })).toBe(true);
    expect(bookmarkNeedsPreview({ url: "https://github.com/org/repo", title: "My Repo" })).toBe(false);
    expect(bookmarkNeedsPreview({ url: "https://github.com/org/repo", title: "github.com", description: "x" })).toBe(false);
  });
});

describe("setCallout / setToggleBlock convert in place", () => {
  it("wraps the current paragraph in a callout instead of inserting a sibling", () => {
    const editor = makeEditor("<p>note</p>");
    editor.commands.focus();
    editor.commands.setTextSelection(2);
    expect(editor.commands.setCallout()).toBe(true);
    const top = editor.getJSON().content ?? [];
    const calloutIndex = top.findIndex((node) => node.type === "callout");
    expect(calloutIndex).toBeGreaterThanOrEqual(0);
    expect(top.slice(0, calloutIndex).some((node) => node.type === "paragraph")).toBe(false);
    editor.destroy();
  });

  it("wraps the current paragraph in a toggle instead of inserting a sibling", () => {
    const editor = makeEditor("<p>note</p>");
    editor.commands.focus();
    editor.commands.setTextSelection(2);
    expect(editor.commands.setToggleBlock()).toBe(true);
    const top = editor.getJSON().content ?? [];
    const toggleIndex = top.findIndex((node) => node.type === "toggleBlock");
    expect(toggleIndex).toBeGreaterThanOrEqual(0);
    expect(top.slice(0, toggleIndex).some((node) => node.type === "paragraph")).toBe(false);
    editor.destroy();
  });
});

describe("block move, duplicate, and delete", () => {
  it("moves the current paragraph up one slot", () => {
    const editor = makeEditor("<p>alpha</p><p>beta</p>");
    editor.commands.setTextSelection(8);
    expect(moveBlock(editor, "up")).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe("beta");
    expect(editor.state.doc.child(1)?.textContent).toBe("alpha");
    editor.destroy();
  });

  it("duplicates the current paragraph after itself", () => {
    const editor = makeEditor("<p>alpha</p>");
    editor.commands.focus("end");
    expect(duplicateBlock(editor)).toBe(true);
    const paragraphs = (editor.getJSON().content ?? []).filter((node) => node.type === "paragraph" && node.content);
    const withAlpha = paragraphs.filter((node) => node.content?.some((child) => child.text === "alpha"));
    expect(withAlpha.length).toBe(2);
    editor.destroy();
  });

  it("deletes the current block without emptying a sibling", () => {
    const editor = makeEditor("<p>keep</p><p>drop</p>");
    editor.commands.setTextSelection(8);
    expect(deleteCurrentBlock(editor)).toBe(true);
    expect(editor.state.doc.textContent).toContain("keep");
    expect(editor.state.doc.textContent).not.toContain("drop");
    editor.destroy();
  });
});
