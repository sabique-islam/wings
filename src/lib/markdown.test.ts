// Regression tests for the markdown <-> html round trip.
//
// These guard against extension/conversion changes that have previously
// broken the editor in subtle ways:
//   - duplicate Link extension swallowing Enter
//   - turndown losing inline marks like bold/italic
//   - markdown shortcut tokens (`#`, `**…**`, `- `) failing to render as
//     real block/inline structure
//
// If any of these break, autosave silently desyncs from what the user sees
// and from what the AI reads — so we test the round trip exhaustively.

import { describe, it, expect } from "vitest";
import { htmlToMarkdown, markdownToHtml } from "./markdown";

function roundtrip(md: string): string {
  return htmlToMarkdown(markdownToHtml(md));
}

describe("markdown <-> html conversion", () => {
  it("preserves a heading", () => {
    const html = markdownToHtml("# Hello");
    expect(html).toContain("<h1");
    expect(html).toContain("Hello");
  });

  it("converts ** to bold", () => {
    const html = markdownToHtml("This is **bold** text");
    expect(html).toMatch(/<strong>bold<\/strong>/);
  });

  it("converts * to italic", () => {
    const html = markdownToHtml("This is *emph* text");
    expect(html).toMatch(/<em>emph<\/em>/);
  });

  it("renders unordered lists", () => {
    const html = markdownToHtml("- one\n- two\n- three");
    expect(html).toContain("<ul>");
    expect(html.match(/<li>/g)?.length).toBe(3);
  });

  it("renders ordered lists", () => {
    const html = markdownToHtml("1. a\n2. b");
    expect(html).toContain("<ol>");
  });

  it("keeps a non-1 numbered start", () => {
    const html = markdownToHtml("3. third\n4. fourth");
    expect(html).toContain('<ol start="3">');
    expect(htmlToMarkdown(html)).toMatch(/^3\.\s+third/m);
  });

  it("renders fenced code blocks", () => {
    const html = markdownToHtml("```ts\nconst x = 1;\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("const x = 1;");
  });

  it("round-trips mermaid fences without dropping the source", () => {
    const out = roundtrip("```mermaid\nflowchart TD\nA-->B\n```");
    expect(out).toContain("```mermaid");
    expect(out).toContain("A-->B");
  });

  it("renders inline code", () => {
    expect(markdownToHtml("an `inline` token")).toMatch(/<code>inline<\/code>/);
  });

  it("preserves headings round-trip", () => {
    expect(roundtrip("# H1")).toBe("# H1");
    expect(roundtrip("## H2")).toBe("## H2");
  });

  it("preserves bold/italic round-trip", () => {
    const out = roundtrip("**hi** _there_");
    expect(out).toMatch(/\*\*hi\*\*/);
    expect(out).toMatch(/_there_/);
  });

  it("keeps paragraph breaks (blank line between paragraphs)", () => {
    const out = roundtrip("first paragraph\n\nsecond paragraph");
    expect(out).toMatch(/first paragraph\n\nsecond paragraph/);
  });

  it("does not collapse two paragraphs into one (Enter regression)", () => {
    const out = roundtrip("line one\n\nline two");
    expect(out.split(/\n\n+/).length).toBeGreaterThanOrEqual(2);
  });

  it("is empty-safe", () => {
    expect(markdownToHtml("")).toBe("");
    expect(htmlToMarkdown("")).toBe("");
    expect(htmlToMarkdown("<p></p>").trim()).toBe("");
  });

  it("keeps underline through turndown", () => {
    expect(htmlToMarkdown("<p><u>under</u></p>")).toContain("<u>under</u>");
  });

  it("escapes html in code fences via marked", () => {
    const html = markdownToHtml("```\n<script>\n```");
    expect(html).toContain("&lt;script&gt;");
  });

  it("preserves callout HTML round-trip", () => {
    const blob = '<div data-type="callout" data-emoji="💡" class="callout-block"><p>note</p></div>';
    const md = htmlToMarkdown(blob);
    expect(md).toContain('data-type="callout"');
    expect(markdownToHtml(md)).toContain('<div data-type="callout"');
  });

  it("turns GFM and Obsidian callout quotes into callout blocks", () => {
    const note = markdownToHtml("> [!note]\n> body");
    expect(note).toContain('data-type="callout"');
    expect(note).toContain('data-emoji="💬"');
    expect(note).toContain("body");
    expect(note).not.toContain("<blockquote");

    const warning = markdownToHtml("> [!warning] Title\n> body");
    expect(warning).toContain('data-type="callout"');
    expect(warning).toContain('data-emoji="⚠️"');
    expect(warning).toContain("Title");

    const emoji = markdownToHtml("> [!💡]\n> idea");
    expect(emoji).toContain('data-type="callout"');
    expect(emoji).toContain('data-emoji="💡"');
  });

  it("leaves ordinary quotes and fenced decoys as quotes/code", () => {
    const quote = markdownToHtml("> just a quote");
    expect(quote).toContain("<blockquote");
    expect(quote).not.toContain('data-type="callout"');

    const fenced = markdownToHtml("```\n> [!note]\n> not a callout\n```");
    expect(fenced).not.toContain('data-type="callout"');
    expect(fenced).toContain("<pre>");
  });

  it("preserves collapsed heading HTML so fold survives markdown load", () => {
    const blob = '<h2 data-collapsed="true">Folded</h2>';
    const md = htmlToMarkdown(blob);
    expect(md).toContain('data-collapsed="true"');
    expect(markdownToHtml(md)).toContain('data-collapsed="true"');
  });

  it("preserves heading background so planner bars survive markdown load", () => {
    const blob = '<h3 data-bg="#f1f1ef">Sunday</h3>';
    const md = htmlToMarkdown(blob);
    expect(md).toContain('data-bg="#f1f1ef"');
    expect(markdownToHtml(md)).toContain('data-bg="#f1f1ef"');
  });

  it("preserves template button HTML round-trip", () => {
    const blob = '<div data-type="template-button" data-label="New week" data-kind="weekly-planner"></div>';
    const md = htmlToMarkdown(blob);
    expect(md).toContain('data-type="template-button"');
    expect(markdownToHtml(md)).toContain('data-type="template-button"');
  });

  it("preserves collapsed heading HTML when UniqueID puts id before data-collapsed", () => {
    const blob = '<h2 id="abc" data-collapsed="true">Folded</h2>';
    const md = htmlToMarkdown(blob);
    expect(md).toContain('data-collapsed="true"');
    expect(markdownToHtml(md)).toContain('data-collapsed="true"');
    expect(markdownToHtml(md)).toContain("Folded");
  });

  it("keeps folded heading body in markdown so reload cannot drop it", () => {
    const blob = '<h2 data-collapsed="true">Alpha</h2><p>secret body</p>';
    const md = htmlToMarkdown(blob);
    expect(md).toContain("secret body");
    expect(md).toContain('data-collapsed="true"');
  });

  it("preserves nested outline paragraphs as HTML", () => {
    const blob = '<div data-type="paragraph">hello<p>world</p></div>';
    const md = htmlToMarkdown(blob);
    expect(md).toContain('data-type="paragraph"');
    expect(markdownToHtml(md)).toContain('data-type="paragraph"');
  });

  it("preserves nested outline HTML when UniqueID puts id before data-type", () => {
    const blob = '<div id="abc" data-type="paragraph">hello<p>world</p></div>';
    const md = htmlToMarkdown(blob);
    expect(md).toContain('data-type="paragraph"');
    expect(markdownToHtml(md)).toContain('data-type="paragraph"');
    expect(markdownToHtml(md)).toContain("world");
  });

  it("preserves toggle HTML round-trip", () => {
    const blob = '<div data-type="toggle" data-summary="Fold" data-open="true"><p>hidden</p></div>';
    const md = htmlToMarkdown(blob);
    expect(md).toContain('data-type="toggle"');
    expect(markdownToHtml(md)).toContain('<div data-type="toggle"');
  });

  it("preserves embed HTML round-trip", () => {
    const blob = '<div data-type="embed" data-url="https://youtube.com" data-embed-url="https://youtube.com/embed/x"><iframe src="https://youtube.com/embed/x"></iframe></div>';
    const md = htmlToMarkdown(blob);
    expect(md).toContain('data-type="embed"');
    expect(markdownToHtml(md)).toContain('<div data-type="embed"');
  });
});

// Custom blocks are stored as HTML because markdown cannot express them. An
// over-eager HTML guard used to escape them back into literal text, so every
// callout, toggle, bookmark and formula was lost whenever a page loaded from
// markdown (vault sync, import, or an empty content_json).
describe("custom block markup survives the html guard", () => {
  it("renders a block formula as a node, not escaped text", () => {
    const html = markdownToHtml("$$\na^2 + b^2\n$$");
    expect(html).toContain('data-type="block-math"');
    expect(html).not.toContain("&lt;div");
  });

  it("renders an inline formula as a node, not escaped text", () => {
    const html = markdownToHtml("an $x^2$ token");
    expect(html).toContain('<span data-type="inline-math"');
    expect(html).not.toContain("&lt;/span&gt;");
  });

  it("still escapes html that is not a known block", () => {
    const html = markdownToHtml('<div onclick="steal()">hi</div>');
    expect(html).toContain("&lt;div");
    expect(html).not.toContain("<div onclick");
  });

  it("still escapes script tags", () => {
    expect(markdownToHtml("<script>alert(1)</script>")).not.toContain("<script>");
  });
});

// Bookmarks, formulas and page embeds hold everything in attributes, so the
// element is empty. Turndown drops blank nodes before any rule runs, which
// erased these blocks from a page's markdown whenever they stood alone.
describe("attribute-only blocks survive serialization", () => {
  it("keeps a bookmark that is the only block on the page", () => {
    const md = htmlToMarkdown('<div data-type="bookmark" data-url="https://a.com"></div>');
    expect(md).toContain('data-type="bookmark"');
  });

  it("keeps a block formula that is the only block on the page", () => {
    expect(htmlToMarkdown('<div data-type="block-math" data-latex="a^2"></div>')).toBe("$$\na^2\n$$");
  });

  it("keeps an inline formula", () => {
    const md = htmlToMarkdown('<p>x <span data-type="inline-math" data-latex="a^2"></span></p>');
    expect(md).toContain("$a^2$");
  });

  it("round-trips a page that is only a formula", () => {
    const md = htmlToMarkdown('<div data-type="block-math" data-latex="a^2"></div>');
    expect(markdownToHtml(md)).toContain('data-latex="a^2"');
  });
});

describe("ChatGPT / LaTeX dump markdown", () => {
  it("renders \\( \\) inline and \\[ \\] display", () => {
    const html = markdownToHtml("Euler \\(e^{i\\pi}+1=0\\) then \\[a^2+b^2\\]");
    expect(html).toContain('data-type="inline-math"');
    expect(html).toContain("e^{i\\pi}+1=0");
    expect(html).toContain('data-type="block-math"');
    expect(html).toContain("a^2+b^2");
  });

  it("renders the ChatGPT integration-by-parts paste as two block formulas", () => {
    const paste = `If you mean an integration-by-parts equation:

[
\\boxed{\\int u,dv = uv-\\int v,du}
]

Example:

[
\\int x e^x,dx = xe^x-\\int e^x,dx = e^x(x-1)+C
]
`;
    const html = markdownToHtml(paste);
    const blocks = html.match(/data-type="block-math"/g) ?? [];
    expect(blocks.length).toBe(2);
    expect(html).toContain("\\boxed{");
    expect(html).toContain("\\int u\\,dv");
    expect(html).toContain("e^x\\,dx");
    expect(html).not.toContain("&lt;div");
  });

  it("wraps a bare align environment", () => {
    const html = markdownToHtml("\\begin{align}\na &= b\n\\end{align}");
    expect(html).toContain('data-type="block-math"');
    expect(html).toContain("\\begin{align}");
  });

  it("round-trips a ChatGPT dump through htmlToMarkdown", () => {
    const paste = "[\n\\boxed{a^2+b^2}\n]";
    const html = markdownToHtml(paste);
    const md = htmlToMarkdown(html);
    expect(md).toContain("$$");
    expect(md).toContain("\\boxed");
    const again = markdownToHtml(md);
    expect(again).toContain('data-type="block-math"');
    expect(again).toContain("\\boxed");
  });
});

describe("page embed round trip", () => {
  const embedHtml = (attrs: string) => `<div data-type="page-embed" ${attrs}></div>`;

  it("keeps the page id when serializing an embed", () => {
    const md = htmlToMarkdown(embedHtml('data-page-id="page-x" data-title="Roadmap"'));
    expect(md).toBe("![Roadmap](#page:page-x)");
  });

  it("restores the page id after a full round trip", () => {
    const md = htmlToMarkdown(embedHtml('data-page-id="page-x" data-title="Roadmap"'));
    const html = markdownToHtml(md);
    expect(html).toContain('data-type="page-embed"');
    expect(html).toContain('data-page-id="page-x"');
    expect(html).toContain('data-title="Roadmap"');
  });

  it("falls back to wikilink syntax when the embed has no page id", () => {
    expect(htmlToMarkdown(embedHtml('data-title="Roadmap"'))).toBe("![[Roadmap]]");
  });

  it("resolves a hand-written wikilink embed to a page id by title", () => {
    const html = markdownToHtml("![[Reading List]]", (title) =>
      title === "Reading List" ? "page-reading" : null,
    );
    expect(html).toContain('data-page-id="page-reading"');
  });

  it("leaves an unmatched wikilink embed without a page id", () => {
    const html = markdownToHtml("![[Nowhere]]", () => null);
    expect(html).toContain('data-type="page-embed"');
    expect(html).not.toContain("data-page-id");
  });

  it("keeps the alias as the display title", () => {
    const html = markdownToHtml("![[Reading List|Books]]");
    expect(html).toContain('data-title="Reading List"');
    expect(html).toContain('data-page-title="Books"');
  });

  it("leaves ordinary images alone", () => {
    const html = markdownToHtml("![alt text](https://example.com/a.png)");
    expect(html).not.toContain("page-embed");
    expect(html).toContain("<img");
  });
});

describe("page ref round trip", () => {
  it("keeps the page id when serializing an inline page link", () => {
    const html = '<a href="#page:page-x" data-type="page-ref" data-page-id="page-x">Roadmap</a>';
    expect(htmlToMarkdown(html)).toBe("[Roadmap](#page:page-x)");
  });

  it("parses a markdown page link back into an anchor the editor can lift", () => {
    const html = markdownToHtml("see [Old](#page:page-x) later");
    expect(html).toContain('href="#page:page-x"');
    expect(html).toContain("Old");
    expect(htmlToMarkdown(html)).toContain("[Old](#page:page-x)");
  });
});
