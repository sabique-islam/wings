import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { htmlToMarkdown } from "@/lib/markdown";
import { shouldBlockEmptySave } from "@/lib/editorContent";
import { createBlockEditorExtensions } from "./editorExtensions";
import { PAGE_REF_NODE } from "./pageRef";
import {
  activeLinkTarget,
  convertActiveLinkToBookmark,
  convertActiveLinkToEmbed,
  copyHrefForTarget,
  linkMarkRangeAtSelection,
  linkToolbarActions,
  openActiveLink,
  shouldShowEditorBubble,
  shouldShowFormatButtons,
  unlinkActiveLink,
} from "./linkToolbar";

function makeEditor(
  content: string | object = "<p></p>",
  pages: Array<{ id: string; title: string }> = [{ id: "p1", title: "Reading" }],
) {
  return new Editor({
    extensions: createBlockEditorExtensions({ getPages: () => pages }),
    content,
  });
}

function placeCaretInText(editor: Editor, text: string) {
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.isText && node.text === text) {
      pos = nodePos + Math.floor(node.nodeSize / 2);
      return false;
    }
  });
  if (pos == null) throw new Error(`text "${text}" not found`);
  editor.commands.setTextSelection(pos);
}

/** TipTap refuses javascript: on parse/setLink — apply the mark on the transaction. */
function forceLinkOnText(editor: Editor, text: string, href: string) {
  let from: number | null = null;
  let to: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.isText && node.text === text) {
      from = nodePos;
      to = nodePos + node.nodeSize;
      return false;
    }
  });
  if (from == null || to == null) throw new Error(`text "${text}" not found`);
  const mark = editor.state.schema.marks.link.create({ href });
  editor.view.dispatch(editor.state.tr.addMark(from, to, mark));
  editor.commands.setTextSelection(from + 1);
}

function selectPageRef(editor: Editor) {
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === PAGE_REF_NODE) {
      pos = nodePos;
      return false;
    }
  });
  if (pos == null) throw new Error("pageRef not found");
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
}

function countType(editor: Editor, type: string): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === type) count += 1;
  });
  return count;
}

describe("shouldShowEditorBubble", () => {
  it("shows when the caret is in a link even if the selection is collapsed", () => {
    expect(
      shouldShowEditorBubble({
        editable: true,
        from: 3,
        to: 3,
        linkActive: true,
        pageRefActive: false,
        viewFocused: true,
      }),
    ).toBe(true);
  });

  it("hides when the caret is in plain text", () => {
    expect(
      shouldShowEditorBubble({
        editable: true,
        from: 3,
        to: 3,
        linkActive: false,
        pageRefActive: false,
        viewFocused: true,
      }),
    ).toBe(false);
  });

  it("shows for a non-empty selection", () => {
    expect(
      shouldShowEditorBubble({
        editable: true,
        from: 1,
        to: 5,
        linkActive: false,
        pageRefActive: false,
        viewFocused: true,
      }),
    ).toBe(true);
  });

  it("hides when the editor is not focused", () => {
    expect(
      shouldShowEditorBubble({
        editable: true,
        from: 3,
        to: 3,
        linkActive: true,
        pageRefActive: false,
        viewFocused: false,
      }),
    ).toBe(false);
  });
});

describe("shouldShowFormatButtons", () => {
  it("hides format buttons for a collapsed caret in a link", () => {
    expect(shouldShowFormatButtons({ selectionEmpty: true, linkActive: true, pageRefActive: false })).toBe(
      false,
    );
  });

  it("hides format buttons on a page chip", () => {
    expect(shouldShowFormatButtons({ selectionEmpty: false, linkActive: false, pageRefActive: true })).toBe(
      false,
    );
  });

  it("keeps format buttons for a highlighted range", () => {
    expect(shouldShowFormatButtons({ selectionEmpty: false, linkActive: true, pageRefActive: false })).toBe(
      true,
    );
  });
});

describe("linkToolbarActions", () => {
  it("offers open, copy, edit, unlink, and bookmark for https", () => {
    expect(
      linkToolbarActions({ kind: "http", href: "https://github.com/org/repo", safeHref: "https://github.com/org/repo" }),
    ).toEqual(["open", "copy", "edit", "unlink", "bookmark"]);
  });

  it("offers embed for an allowlisted host", () => {
    const actions = linkToolbarActions({
      kind: "http",
      href: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      safeHref: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(actions).toContain("embed");
    expect(actions).toContain("bookmark");
  });

  it("offers embed after rewriting youtu.be", () => {
    expect(
      linkToolbarActions({
        kind: "http",
        href: "https://youtu.be/dQw4w9WgXcQ",
        safeHref: "https://youtu.be/dQw4w9WgXcQ",
      }),
    ).toContain("embed");
  });

  it("only allows edit and unlink for javascript: hrefs", () => {
    expect(linkToolbarActions({ kind: "http", href: "javascript:alert(1)", safeHref: null })).toEqual([
      "edit",
      "unlink",
    ]);
  });

  it("offers open, peek, copy, unlink for a page chip — no convert", () => {
    expect(linkToolbarActions({ kind: "page", href: "#page:p1", pageId: "p1" })).toEqual([
      "open",
      "peek",
      "copy",
      "unlink",
    ]);
  });
});

describe("activeLinkTarget", () => {
  it("reads an http link at the caret", () => {
    const editor = makeEditor('<p><a href="https://example.com">hello</a></p>');
    placeCaretInText(editor, "hello");
    expect(activeLinkTarget(editor)).toEqual({
      kind: "http",
      href: "https://example.com",
      safeHref: "https://example.com/",
    });
    editor.destroy();
  });

  it("rejects javascript: as a safe href", () => {
    const editor = makeEditor("<p>x</p>");
    forceLinkOnText(editor, "x", "javascript:alert(1)");
    const target = activeLinkTarget(editor);
    expect(target).toEqual({ kind: "http", href: "javascript:alert(1)", safeHref: null });
    expect(copyHrefForTarget(target!)).toBeNull();
    editor.destroy();
  });

  it("reads a selected page chip", () => {
    const editor = makeEditor("<p></p>");
    editor.commands.insertContent({ type: PAGE_REF_NODE, attrs: { pageId: "p1" } });
    selectPageRef(editor);
    expect(activeLinkTarget(editor)).toEqual({ kind: "page", href: "#page:p1", pageId: "p1" });
    editor.destroy();
  });
});

describe("unlinkActiveLink", () => {
  it("keeps the text and drops the mark", () => {
    const editor = makeEditor('<p><a href="https://example.com">hello</a></p>');
    placeCaretInText(editor, "hello");
    expect(unlinkActiveLink(editor)).toBe(true);
    expect(htmlToMarkdown(editor.getHTML())).toBe("hello");
    expect(editor.isActive("link")).toBe(false);
    editor.destroy();
  });

  it("turns a page chip into its live title", () => {
    const editor = makeEditor("<p></p>", [{ id: "p1", title: "Reading" }]);
    editor.commands.insertContent({ type: PAGE_REF_NODE, attrs: { pageId: "p1" } });
    selectPageRef(editor);
    expect(unlinkActiveLink(editor)).toBe(true);
    expect(countType(editor, PAGE_REF_NODE)).toBe(0);
    expect(editor.state.doc.textContent).toContain("Reading");
    editor.destroy();
  });
});

describe("convertActiveLinkToBookmark", () => {
  it("replaces a paragraph that is only the link", () => {
    const editor = makeEditor('<p><a href="https://example.com">hello</a></p>');
    placeCaretInText(editor, "hello");
    expect(linkMarkRangeAtSelection(editor)).toMatchObject({ from: 1, to: 6 });
    expect(convertActiveLinkToBookmark(editor)).toBe(true);
    expect(countType(editor, "bookmark")).toBe(1);
    expect(editor.state.doc.textContent).not.toContain("hello");
    editor.destroy();
  });

  it("keeps surrounding text when the link is mid-paragraph", () => {
    const editor = makeEditor('<p>See <a href="https://example.com">docs</a> here</p>');
    placeCaretInText(editor, "docs");
    expect(convertActiveLinkToBookmark(editor)).toBe(true);
    expect(countType(editor, "bookmark")).toBe(1);
    expect(editor.state.doc.textContent).toContain("See");
    expect(editor.state.doc.textContent).toContain("here");
    expect(editor.state.doc.textContent).not.toContain("docs");
    editor.destroy();
  });

  it("does not convert javascript: and leaves the document alone", () => {
    const editor = makeEditor("<p>x</p>");
    forceLinkOnText(editor, "x", "javascript:alert(1)");
    const before = editor.getJSON();
    expect(convertActiveLinkToBookmark(editor)).toBe(false);
    expect(convertActiveLinkToEmbed(editor)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expect(countType(editor, "bookmark")).toBe(0);
    editor.destroy();
  });

  it("does not persist empty over existing content", () => {
    const existing = "this is more than twenty chars";
    const editor = makeEditor('<p>Keep <a href="https://example.com">this</a> sentence</p>');
    placeCaretInText(editor, "this");
    convertActiveLinkToBookmark(editor);
    const next = htmlToMarkdown(editor.getHTML());
    expect(shouldBlockEmptySave(existing, next)).toBe(false);
    expect(next.trim().length).toBeGreaterThan(0);
    expect(next).toContain("Keep");
    editor.destroy();
  });
});

describe("convertActiveLinkToEmbed", () => {
  it("converts an allowlisted URL and rejects github", () => {
    const yt = makeEditor(
      '<p><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">video</a></p>',
    );
    placeCaretInText(yt, "video");
    expect(convertActiveLinkToEmbed(yt)).toBe(true);
    expect(countType(yt, "embed")).toBe(1);
    yt.destroy();

    const gh = makeEditor('<p><a href="https://github.com/org/repo">repo</a></p>');
    placeCaretInText(gh, "repo");
    expect(convertActiveLinkToEmbed(gh)).toBe(false);
    expect(countType(gh, "embed")).toBe(0);
    gh.destroy();
  });
});

describe("openActiveLink", () => {
  it("does not open javascript: urls", () => {
    const editor = makeEditor("<p>x</p>");
    forceLinkOnText(editor, "x", "javascript:alert(1)");
    const opened: string[] = [];
    const original = window.open;
    window.open = ((url?: string | URL) => {
      opened.push(String(url ?? ""));
      return null;
    }) as typeof window.open;
    expect(openActiveLink(editor)).toBe(false);
    expect(opened).toEqual([]);
    window.open = original;
    editor.destroy();
  });
});
