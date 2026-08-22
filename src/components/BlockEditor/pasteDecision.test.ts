import { describe, expect, it } from "vitest";
import { looksLikeMarkdown, markdownWinsOverHtml, parseTsv, shouldPasteAsMarkdown, tsvPasteMode } from "./pasteDecision";

const MARKDOWN_DOC = "# Hi\n\n- a";

const GITHUB_BLOB_HTML = `<meta charset="utf-8"><div class="blob-wrapper"><table class="highlight"><tr><td class="blob-num js-line-number" data-line-number="1"></td><td class="blob-code js-file-line"># Hi</td></tr><tr><td class="blob-num js-line-number" data-line-number="2"></td><td class="blob-code js-file-line"></td></tr><tr><td class="blob-num js-line-number" data-line-number="3"></td><td class="blob-code js-file-line">- a</td></tr></table></div>`;

const GITHUB_PRE_HTML = `<meta charset="utf-8"><div class="snippet-clipboard-content"><pre># Hi\n\n- a</pre></div>`;

const SLACK_HTML = `<span data-stringify-type="paragraph"># Hi</span><span data-stringify-type="paragraph"></span><span data-stringify-type="paragraph">- a</span><span data-stringify-type="overflow"></span>`;

const VSCODE_HTML = `<meta charset="utf-8"><div style="color:#d4d4d4;font-family:Menlo,monospace"><div># Hi</div><div><br></div><div>- a</div></div>`;

const TABLE_HTML = `<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>`;

const IMG_HTML = `<p><img src="https://example.com/x.png" alt="x"></p>`;

const CALLOUT_HTML = `<div data-type="callout" data-emoji="💡"><p>note</p></div>`;

const ARTICLE_HTML = `<h1>Hi</h1><ul><li>a</li></ul>`;

describe("looksLikeMarkdown", () => {
  it("detects headings, lists, fences, and bold", () => {
    expect(looksLikeMarkdown("# Hi")).toBe(true);
    expect(looksLikeMarkdown("- a")).toBe(true);
    expect(looksLikeMarkdown("1. a")).toBe(true);
    expect(looksLikeMarkdown("```js\nx\n```")).toBe(true);
    expect(looksLikeMarkdown("hello **bold** world")).toBe(true);
    expect(looksLikeMarkdown("> quote")).toBe(true);
    expect(looksLikeMarkdown("- [ ] task")).toBe(true);
  });

  it("rejects empty text and plain prose", () => {
    expect(looksLikeMarkdown("")).toBe(false);
    expect(looksLikeMarkdown("just a sentence")).toBe(false);
    expect(looksLikeMarkdown("a\tb\n1\t2")).toBe(false);
  });
});

describe("markdownWinsOverHtml", () => {
  it("prefers markdown for GitHub blob line-number tables", () => {
    expect(markdownWinsOverHtml(GITHUB_BLOB_HTML, MARKDOWN_DOC)).toBe(true);
  });

  it("prefers markdown for GitHub <pre> wrappers", () => {
    expect(markdownWinsOverHtml(GITHUB_PRE_HTML, MARKDOWN_DOC)).toBe(true);
  });

  it("prefers markdown for Slack span soup", () => {
    expect(markdownWinsOverHtml(SLACK_HTML, MARKDOWN_DOC)).toBe(true);
  });

  it("prefers markdown for VS Code / Cursor div soup", () => {
    expect(markdownWinsOverHtml(VSCODE_HTML, MARKDOWN_DOC)).toBe(true);
  });

  it("keeps a real HTML table", () => {
    expect(markdownWinsOverHtml(TABLE_HTML, "a\tb\n1\t2")).toBe(false);
    expect(markdownWinsOverHtml(TABLE_HTML, "# Hi\n\n| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe(false);
  });

  it("keeps an image", () => {
    expect(markdownWinsOverHtml(IMG_HTML, "# Hi\n\n![x](https://example.com/x.png)")).toBe(false);
  });

  it("keeps Wings custom blocks", () => {
    expect(markdownWinsOverHtml(CALLOUT_HTML, "> note")).toBe(false);
  });

  it("keeps structured article HTML", () => {
    expect(markdownWinsOverHtml(ARTICLE_HTML, MARKDOWN_DOC)).toBe(false);
  });
});

describe("shouldPasteAsMarkdown", () => {
  it("pastes markdown when HTML is GitHub/Slack junk", () => {
    expect(shouldPasteAsMarkdown(MARKDOWN_DOC, GITHUB_BLOB_HTML)).toBe(true);
    expect(shouldPasteAsMarkdown(MARKDOWN_DOC, SLACK_HTML)).toBe(true);
    expect(shouldPasteAsMarkdown(MARKDOWN_DOC, "")).toBe(true);
    expect(shouldPasteAsMarkdown("hello **bold** world", "")).toBe(true);
  });

  it("does not steal HTML tables, images, or TSV-only clipboards", () => {
    expect(shouldPasteAsMarkdown("a\tb\n1\t2", TABLE_HTML)).toBe(false);
    expect(shouldPasteAsMarkdown("# Hi", TABLE_HTML)).toBe(false);
    expect(shouldPasteAsMarkdown("# Hi", IMG_HTML)).toBe(false);
    expect(shouldPasteAsMarkdown("plain prose", VSCODE_HTML)).toBe(false);
  });
});

describe("parseTsv", () => {
  it("reads spreadsheet rows and pads ragged columns", () => {
    expect(parseTsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseTsv("a\tb\t\n1\t2")).toEqual([
      ["a", "b", ""],
      ["1", "2", ""],
    ]);
  });

  it("rejects prose, single columns, and pipe markdown tables", () => {
    expect(parseTsv("just a sentence")).toBeNull();
    expect(parseTsv("one\ntwo\nthree")).toBeNull();
    expect(parseTsv("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBeNull();
  });
});

describe("tsvPasteMode", () => {
  it("fills when the caret is in a table", () => {
    expect(tsvPasteMode("a\tb\n1\t2", TABLE_HTML, true)).toBe("fill");
  });

  it("lets a real HTML table win outside a table", () => {
    expect(tsvPasteMode("a\tb\n1\t2", TABLE_HTML, false)).toBe("none");
  });

  it("inserts a table from TSV when HTML is not a real table", () => {
    expect(tsvPasteMode("a\tb\n1\t2", "", false)).toBe("insert");
    expect(tsvPasteMode("a\tb\n1\t2", VSCODE_HTML, false)).toBe("insert");
  });
});
