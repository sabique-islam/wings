import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import { PAGE_REF_NODE } from "./pageRef";
import {
  collectFindMatches,
  findRangesInText,
  replaceAllInString,
  stepMatchIndex,
  wouldEmptyReplaceAll,
} from "./findReplace";
import { findReplaceKey } from "./FindReplaceExtension";
import { htmlToMarkdown } from "@/lib/markdown";

describe("findRangesInText", () => {
  it("finds non-overlapping matches", () => {
    expect(findRangesInText("alpha alpha", "alpha", false)).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
    ]);
  });

  it("respects case when asked", () => {
    expect(findRangesInText("Alpha", "alpha", true)).toEqual([]);
    expect(findRangesInText("Alpha", "alpha", false)).toEqual([{ start: 0, end: 5 }]);
  });
});

describe("collectFindMatches", () => {
  it("includes page chips by live title, not id", () => {
    const matches = collectFindMatches(
      {
        descendants(fn) {
          fn(
            {
              type: { name: PAGE_REF_NODE },
              nodeSize: 1,
              attrs: { pageId: "p1" },
            },
            3,
          );
        },
      },
      "Books",
      { caseSensitive: false, pageTitle: (id) => (id === "p1" ? "Bookshelf" : "") },
    );
    expect(matches).toEqual([{ from: 3, to: 4, replaceable: false }]);
  });

  it("does not match a page chip by id", () => {
    const matches = collectFindMatches(
      {
        descendants(fn) {
          fn(
            {
              type: { name: PAGE_REF_NODE },
              nodeSize: 1,
              attrs: { pageId: "page-reading-list" },
            },
            1,
          );
        },
      },
      "page-reading-list",
      { caseSensitive: false, pageTitle: () => "Reading List" },
    );
    expect(matches).toEqual([]);
  });
});

describe("wouldEmptyReplaceAll", () => {
  const longAs = {
    descendants(fn: (node: { isText?: boolean; text?: string; nodeSize: number; type: { name: string } }, pos: number) => void) {
      fn({ isText: true, text: "a".repeat(25), nodeSize: 25, type: { name: "text" } }, 1);
    },
  };

  it("blocks replacing every character of a long page with nothing", () => {
    expect(wouldEmptyReplaceAll(longAs, "a", "", false)).toBe(true);
  });

  it("allows a replace that leaves text", () => {
    expect(wouldEmptyReplaceAll(longAs, "a", "b", false)).toBe(false);
  });

  it("treats replace-with-same as a no-op that cannot empty the page", () => {
    expect(replaceAllInString("alpha", "alpha", "alpha", false)).toBe("alpha");
    expect(wouldEmptyReplaceAll(longAs, "a", "a", false)).toBe(false);
  });
});

describe("stepMatchIndex", () => {
  it("wraps around", () => {
    expect(stepMatchIndex(3, 2, 1)).toBe(0);
    expect(stepMatchIndex(3, 0, -1)).toBe(2);
    expect(stepMatchIndex(0, 0, 1)).toBe(-1);
  });
});

describe("findReplace editor commands", () => {
  it("registers findReplace", () => {
    const editor = new Editor({
      extensions: createBlockEditorExtensions(),
      content: "<p>hello</p>",
    });
    expect(editor.extensionManager.extensions.some((ext) => ext.name === "findReplace")).toBe(true);
    expect(editor.extensionManager.extensions.find((ext) => ext.name === "findReplace")?.config.priority).toBe(300);
    editor.destroy();
  });

  it("walks matches and replaces one without touching the others", () => {
    const editor = new Editor({
      extensions: createBlockEditorExtensions(),
      content: "<p>alpha alpha alpha</p>",
    });
    editor.commands.findOpen();
    editor.commands.findSetQuery("alpha");
    const open = findReplaceKey.getState(editor.state) as { matches: unknown[]; active: number };
    expect(open.matches).toHaveLength(3);
    expect(open.active).toBe(0);

    editor.commands.findNext();
    expect((findReplaceKey.getState(editor.state) as { active: number }).active).toBe(1);

    editor.commands.findReplaceCurrent("beta");
    expect(htmlToMarkdown(editor.getHTML())).toBe("alpha beta alpha");
    editor.destroy();
  });

  it("replace all is one document change and keeps leftover text", () => {
    const editor = new Editor({
      extensions: createBlockEditorExtensions(),
      content: "<p>alpha alpha</p>",
    });
    editor.commands.findOpen();
    editor.commands.findSetQuery("alpha");
    expect(editor.commands.findReplaceAll("beta")).toBe(true);
    expect(htmlToMarkdown(editor.getHTML())).toBe("beta beta");
    editor.destroy();
  });

  it("refuses replace-all that would empty a long page", () => {
    const editor = new Editor({
      extensions: createBlockEditorExtensions(),
      content: `<p>${"a".repeat(25)}</p>`,
    });
    editor.commands.findOpen();
    editor.commands.findSetQuery("a");
    expect(editor.commands.findReplaceAll("")).toBe(false);
    expect(htmlToMarkdown(editor.getHTML())).toBe("a".repeat(25));
    editor.destroy();
  });
});
