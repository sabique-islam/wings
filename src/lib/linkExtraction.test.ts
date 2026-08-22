import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { extractLinks, pageIdFromHref } from "./linkExtraction";

function paragraph(...content: JSONContent[]): JSONContent {
  return { type: "paragraph", content };
}

function pageLink(text: string, pageId: string): JSONContent {
  return { type: "text", text, marks: [{ type: "link", attrs: { href: `#page:${pageId}` } }] };
}

describe("pageIdFromHref", () => {
  it("reads the id out of a page link", () => {
    expect(pageIdFromHref("#page:abc-123")).toBe("abc-123");
  });

  it("ignores links that don't point at a page", () => {
    expect(pageIdFromHref("https://example.com")).toBeNull();
    expect(pageIdFromHref("#page:")).toBeNull();
    expect(pageIdFromHref(undefined)).toBeNull();
  });
});

describe("extractLinks", () => {
  it("collects page links from anywhere in the document", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        paragraph({ type: "text", text: "see " }, pageLink("Roadmap", "page-a")),
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [paragraph(pageLink("Notes", "page-b"))] },
          ],
        },
      ],
    };

    expect(extractLinks(doc).outgoing).toEqual(["page-a", "page-b"]);
  });

  it("counts a page linked twice only once", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [paragraph(pageLink("first", "page-a")), paragraph(pageLink("again", "page-a"))],
    };

    expect(extractLinks(doc).outgoing).toEqual(["page-a"]);
  });

  it("ignores external links", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        paragraph({
          type: "text",
          text: "docs",
          marks: [{ type: "link", attrs: { href: "https://example.com" } }],
        }),
      ],
    };

    expect(extractLinks(doc).outgoing).toEqual([]);
  });

  it("reports wikilinks that never resolved to a page", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [paragraph({ type: "text", text: "todo: [[Reading List]] and [[Ideas|x]]" })],
    };

    expect(extractLinks(doc).unresolved).toEqual(["Reading List", "Ideas"]);
  });

  it("treats an empty document as having no links", () => {
    expect(extractLinks(null)).toEqual({ outgoing: [], unresolved: [], tags: [], contexts: {} });
    expect(extractLinks({ type: "doc", content: [] })).toEqual({
      outgoing: [],
      unresolved: [],
      tags: [],
      contexts: {},
    });
  });

  it("collects hashtags from text", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [paragraph({ type: "text", text: "notes on #research and #ideas/nested" })],
    };
    expect(extractLinks(doc).tags).toEqual(["ideas/nested", "research"]);
  });

  it("collects tags from frontmatter when markdown is provided", () => {
    const md = "---\ntags: [Alpha, beta]\n---\n\n# Hello";
    expect(extractLinks({ type: "doc", content: [] }, md).tags).toEqual(["alpha", "beta"]);
  });

  it("counts page embed nodes as outgoing links", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "pageEmbed",
          attrs: { pageId: "page-x", title: "Notes" },
        },
      ],
    };
    expect(extractLinks(doc).outgoing).toEqual(["page-x"]);
  });

  it("counts live page ref nodes as outgoing links", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        paragraph(
          { type: "text", text: "see " },
          { type: "pageRef", attrs: { pageId: "page-a" } },
        ),
      ],
    };
    expect(extractLinks(doc).outgoing).toEqual(["page-a"]);
  });

  it("keeps the sentence a link was written in, for backlink snippets", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        paragraph(
          { type: "text", text: "Picked up from " },
          pageLink("Reading List", "page-a"),
          { type: "text", text: " last week." },
        ),
      ],
    };

    expect(extractLinks(doc).contexts).toEqual({
      "page-a": "Picked up from Reading List last week.",
    });
  });

  it("takes the snippet from markdown when a page has no saved editor json", () => {
    const md = "# Notes\n\n- follow up on [Roadmap](#page:page-a) tomorrow\n";
    expect(extractLinks(null, md).contexts).toEqual({
      "page-a": "follow up on Roadmap tomorrow",
    });
  });
});
