import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "@/components/BlockEditor/editorExtensions";
import { markdownToHtml } from "./markdown";
import { parseHtmlImport, stripExportTitleId } from "./htmlImport";

const NOTION_HTML = `<html><head>
<title>DBMS Unit 1: Introduction, ER Model &amp; SQL DDL/DML — Notes</title>
<style>body { color: red }</style>
</head><body>
<article class="page sans">
<header>
  <div class="page-header-icon"><span class="icon" data-emoji="🏛️"></span></div>
  <h1 class="page-title">DBMS Unit 1: Introduction, ER Model &amp; SQL DDL/DML — Notes</h1>
  <p class="page-description"></p>
</header>
<div class="page-body">
<nav class="table_of_contents" data-notion-toc="">
  <div class="table_of_contents-item"><a class="table_of_contents-link" href="#sec-1">1. Introduction to Databases</a></div>
</nav>
<hr/>
<h1 id="sec-1">1. Introduction to Databases</h1>
<ul class="bulleted-list"><li style="list-style-type:disc"><strong>Data vs. Information</strong>: Data is raw facts.</li></ul>
<ul class="bulleted-list"><li style="list-style-type:disc"><strong>DBMS</strong>: a software system.
  <ul class="bulleted-list"><li style="list-style-type:circle"><strong>Defining</strong>: specifying types.</li></ul>
  <ul class="bulleted-list"><li style="list-style-type:circle"><strong>Sharing</strong>: concurrent access.</li></ul>
</li></ul>
<ol class="numbered-list" start="1"><li><strong>Redundancy</strong> — duplicated details. <em>Fix</em>: centralized storage.</li></ol>
<ol class="numbered-list" start="2"><li><strong>Access</strong> — unplanned queries need a DBMS.</li></ol>
<figure class="equation" data-notion-equation="\\sigma_{\\,Dept\\_Name \\,=\\, \\text{&quot;Physics&quot;}}(Instructor)">
  <div class="equation-container"><span class="katex"><span class="mord mathnormal">σ</span><span>should not appear</span></span></div>
</figure>
<pre class="code code-wrap" data-notion-code-syntax="sql"><code class="language-sql">CREATE TABLE example (
  id INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);</code></pre>
<p>Use <code>NOT NULL</code> with <code>CREATE SCHEMA Library;</code>.</p>
</div>
</article>
</body></html>`;

const UNIT2_TABLE_HTML = `<html><body>
<h1 class="page-title">DBMS Unit 2: Advanced SQL — Notes</h1>
<div class="page-body">
<h1>11. Full-Text Search (MySQL)</h1>
<table class="simple-table">
  <thead><tr><th>Operator</th><th>Meaning</th><th>Example</th></tr></thead>
  <tbody>
    <tr><td>+</td><td>word must be present</td><td>+mysql (must contain "mysql")</td></tr>
    <tr><td>*</td><td>wildcard, suffix only</td><td>data* (matches "data")</td></tr>
  </tbody>
</table>
<pre class="code" data-notion-code-syntax="sql"><code>SELECT * FROM books WHERE MATCH(title) AGAINST('mysql');</code></pre>
</div>
</body></html>`;

function loadInEditor(markdown: string) {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content: markdownToHtml(markdown),
  });
}

describe("parseHtmlImport", () => {
  it("uses the Notion page title and drops CSS, scripts, and the TOC", () => {
    const { title, body } = parseHtmlImport(NOTION_HTML);
    expect(title).toBe("DBMS Unit 1: Introduction, ER Model & SQL DDL/DML — Notes");
    expect(body.startsWith("# DBMS Unit 1:")).toBe(true);
    expect(body).not.toContain("color: red");
    expect(body).not.toContain("table_of_contents");
    expect(body.match(/# DBMS Unit 1:/g)?.length).toBe(1);
  });

  it("merges consecutive Notion one-item lists and keeps nested bullets", () => {
    const { body } = parseHtmlImport(NOTION_HTML);
    expect(body).toMatch(/- \*\*Data vs. Information\*\*: Data is raw facts\.\n- \*\*DBMS\*\*: a software system\./);
    expect(body).toContain("  - **Defining**: specifying types.");
    expect(body).toContain("  - **Sharing**: concurrent access.");
    expect(body).toMatch(/1\. \*\*Redundancy\*\*[^\n]+\n2\. \*\*Access\*\*/);
  });

  it("keeps LaTeX from data-notion-equation and does not dump KaTeX glyphs", () => {
    const { body } = parseHtmlImport(NOTION_HTML);
    expect(body).toContain("\\sigma_{\\,Dept\\_Name");
    expect(body).toContain('\\text{"Physics"}');
    expect(body).not.toContain("should not appear");
    expect(body).toMatch(/\$\$\n\\sigma/);
  });

  it("keeps SQL fences and inline code", () => {
    const { body } = parseHtmlImport(NOTION_HTML);
    expect(body).toContain("```sql");
    expect(body).toContain("CREATE TABLE example");
    expect(body).toContain("`NOT NULL`");
    expect(body).toContain("`CREATE SCHEMA Library;`");
    expect(body).not.toContain("```NOT NULL```");
  });

  it("uses single backticks for inline code and decodes Notion unicode escapes", () => {
    const { body } = parseHtmlImport(`<html><body><div class="page-body">
      <p>Insert <code>DISTINCT</code> after <code>SELECT</code>.</p>
      <p>Arithmetic (<code>+ \\u2013 * /</code>) and <code>Name \\u2261 NAME</code>.</p>
      <p>you <strong>cannot</strong><code>INSERT</code> into a view</p>
    </div></body></html>`);
    expect(body).toContain("`DISTINCT`");
    expect(body).toContain("`SELECT`");
    expect(body).not.toContain("```DISTINCT```");
    expect(body).toContain("–");
    expect(body).toContain("≡");
    expect(body).not.toContain("\\u2013");
    expect(body).toMatch(/\*\*cannot\*\* `INSERT`/);
  });

  it("converts Notion tables to GFM", () => {
    const { title, body } = parseHtmlImport(UNIT2_TABLE_HTML);
    expect(title).toBe("DBMS Unit 2: Advanced SQL — Notes");
    expect(body).toContain("| Operator | Meaning | Example |");
    expect(body).toContain("| + | word must be present |");
    expect(body).toContain("```sql");
    expect(body).toContain("MATCH(title)");
  });

  it("renders through the editor without dropping math, code, or tables", () => {
    const { body } = parseHtmlImport(`${NOTION_HTML}<div class="page-body-extra"></div>`);
    const unit2 = parseHtmlImport(UNIT2_TABLE_HTML).body;
    const editor = loadInEditor(`${body}\n\n${unit2}`);
    const text = editor.getText();
    const html = editor.getHTML();
    expect(text).toContain("Introduction to Databases");
    expect(text).toContain("CREATE TABLE example");
    expect(text).toContain("NOT NULL");
    expect(html).toContain('data-type="block-math"');
    expect(html).toContain("<table");
    expect(html).toContain("<pre");
    expect(html).not.toContain("should not appear");
    editor.destroy();
  });

  it("handles a plain HTML fragment that is not a Notion export", () => {
    const { title, body } = parseHtmlImport(
      "<html><body><h1>Lecture notes</h1><p>Hello <strong>world</strong>.</p><ul><li>one</li><li>two</li></ul></body></html>",
    );
    expect(title).toBe("Lecture notes");
    expect(body).toContain("Hello **world**.");
    expect(body).toContain("- one\n- two");
  });
});

describe("stripExportTitleId", () => {
  it("strips a trailing Notion id and leftover em dash from filenames", () => {
    expect(
      stripExportTitleId("DBMS Unit 1 Introduction, ER Model & SQL DDL DML — 3ddaf5bef03881ab8e29dbba87e6c470"),
    ).toBe("DBMS Unit 1 Introduction, ER Model & SQL DDL DML");
  });
});

const UNIT1_PATH =
  "/Users/sabiqueislam/Downloads/DBMS Unit 1 Introduction, ER Model & SQL DDL DML — 3ddaf5bef03881ab8e29dbba87e6c470.html";
const UNIT2_PATH =
  "/Users/sabiqueislam/Downloads/DBMS Unit 2 Advanced SQL — Notes 3dcaf5bef03881379d0ae614d8175b3d.html";

describe.skipIf(!existsSync(UNIT1_PATH) || !existsSync(UNIT2_PATH))("real Notion HTML exports", () => {
  it("converts both DBMS notes without KaTeX dump or missing sections", async () => {
    const { readFileSync } = await import("node:fs");
    const unit1 = parseHtmlImport(readFileSync(UNIT1_PATH, "utf8"));
    const unit2 = parseHtmlImport(readFileSync(UNIT2_PATH, "utf8"));

    expect(unit1.title).toContain("DBMS Unit 1");
    expect(unit2.title).toContain("DBMS Unit 2");
    for (const body of [unit1.body, unit2.body]) {
      expect(body).not.toMatch(/katex|webkit-print|table_of_contents|class="mord"/);
    }

    const editor1 = loadInEditor(unit1.body);
    const editor2 = loadInEditor(unit2.body);
    const text1 = editor1.getText();
    const html1 = editor1.getHTML();
    const text2 = editor2.getText();
    const html2 = editor2.getHTML();

    expect(text1).toContain("Introduction to Databases");
    expect(text1).toContain("CREATE TABLE example");
    expect(text1).toContain("Entity-Relationship");
    expect(html1).toContain('data-type="block-math"');
    expect(html1.match(/data-type="block-math"/g)?.length).toBe(20);
    expect(html1).toContain("<pre");

    expect(text2).toContain("Window Functions");
    expect(text2).toContain("Full-Text Search");
    expect(html2).toContain("<table");
    expect(text2).toContain("Operator");
    expect(html2).toContain("<pre");
    expect(unit2.body).toContain("`DISTINCT`");
    expect(unit2.body).not.toContain("```DISTINCT```");
    expect(unit2.body).not.toContain("\\u2013");
    expect(unit2.body).not.toContain("\\u2261");

    editor1.destroy();
    editor2.destroy();
  });
});
