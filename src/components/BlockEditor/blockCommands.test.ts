import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import {
  extractSingleLinkFromHtml,
  pasteExternalUrl,
  updateBookmarkMeta,
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

describe("pasteExternalUrl", () => {
  it("inserts one bookmark into an empty paragraph without leaving the raw URL", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.focus();
    const url = "https://github.com/org/repo";
    const pos = pasteExternalUrl(editor, url);
    expect(pos).not.toBeNull();
    expect(bookmarkCount(editor)).toBe(1);
    expect(editor.state.doc.textContent).not.toContain("github.com/org");
    editor.destroy();
  });

  it("replaces a paragraph that already contains only the URL", () => {
    const url = "https://github.com/org/repo";
    const editor = makeEditor(`<p>${url}</p>`);
    editor.commands.focus("end");
    pasteExternalUrl(editor, url);
    expect(bookmarkCount(editor)).toBe(1);
    expect(editor.getHTML()).not.toMatch(new RegExp(`<p[^>]*>${url.replace(/\//g, "\\/")}`));
    editor.destroy();
  });

  it("updates metadata in place without duplicating the bookmark", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.focus();
    const url = "https://github.com/org/repo";
    const pos = pasteExternalUrl(editor, url)!;
    expect(bookmarkCount(editor)).toBe(1);
    updateBookmarkMeta(editor, pos, {
      title: "My Repo",
      description: "Notes",
      image: "https://example.com/og.png",
      favicon: "https://github.com/favicon.ico",
    });
    expect(bookmarkCount(editor)).toBe(1);
    const node = editor.state.doc.nodeAt(pos);
    expect(node?.attrs.title).toBe("My Repo");
    expect(node?.attrs.description).toBe("Notes");
    expect(node?.attrs.url).toBe(url);
    expect(node?.attrs.image).toBe("https://example.com/og.png");
    expect(node?.attrs.favicon).toBe("https://github.com/favicon.ico");
    editor.destroy();
  });

  it("stores the full URL on insert before preview metadata arrives", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.focus();
    const url = "https://github.com/org/repo";
    const pos = pasteExternalUrl(editor, url)!;
    const node = editor.state.doc.nodeAt(pos);
    expect(node?.attrs.url).toBe(url);
    expect(node?.attrs.title).toBe("github.com");
    editor.destroy();
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
