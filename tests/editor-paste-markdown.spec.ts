import { expect, test, type Page } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

const MARKDOWN_DOC = "# Hi\n\n- a";
const JUNK_HTML = `<meta charset="utf-8"><div style="font-family:Menlo"><div># Hi</div><div><br></div><div>- a</div></div>`;
const TABLE_HTML =
  "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>";
const TABLE_TEXT = "a\tb\n1\t2";

const MIXED_MARKDOWN = [
  "Introductory prose before the formula.",
  "Inline $E = mc^2$ in a sentence.",
  "\\[\n\\frac{1}{2} + x^2\n\\]",
  "The diagram follows the equation.",
  "```mermaid\nflowchart LR\n  A[Input] --> B[Output]\n```",
  "Closing prose after the diagram.",
].join("\n\n");

// Selecting rendered content supplies math in HTML annotations, while text/plain
// may have no LaTeX delimiters or Markdown fences at all.
const MIXED_RENDERED_HTML = [
  "<p>Introductory prose before the formula.</p>",
  '<p>Inline <span class="katex"><math><semantics><mrow></mrow><annotation encoding="application/x-tex">E = mc^2</annotation></semantics></math></span> in a sentence.</p>',
  '<div class="katex-display"><span class="katex"><math><semantics><mrow></mrow><annotation encoding="application/x-tex">\\frac{1}{2} + x^2</annotation></semantics></math></span></div>',
  "<p>The diagram follows the equation.</p>",
  '<pre><code class="language-mermaid">flowchart LR\n  A[Input] --&gt; B[Output]</code></pre>',
  "<p>Closing prose after the diagram.</p>",
].join("");

const MIXED_RENDERED_TEXT = "Introductory prose before the formula.\nInline E = mc² in a sentence.\n½ + x²\nThe diagram follows the equation.\nflowchart LR\n  A[Input] --> B[Output]\nClosing prose after the diagram.";

const COPIED_DIAGRAM_SVG = '<svg xmlns="http://www.w3.org/2000/svg" id="chatgpt-mermaid-_r_kv_" width="260" height="80" viewBox="0 0 260 80" aria-roledescription="flowchart"><style>#chatgpt-mermaid-_r_kv_ .node{fill:#eee;stroke:#333}</style><rect class="node" x="10" y="10" width="80" height="50"/><rect class="node" x="160" y="10" width="80" height="50"/><path d="M90 35 L160 35" stroke="black"/><foreignObject x="10" y="10" width="80" height="50"><div xmlns="http://www.w3.org/1999/xhtml">T1</div></foreignObject><text x="180" y="40">T2</text></svg>';
const FLATTENED_DIAGRAM_CSS = '#chatgpt-mermaid-_r_kv_{font-family:Arial;fill:rgb(237,237,237);}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-_r_kv_ .node{fill:#eee;}#chatgpt-mermaid-_r_kv_ .flowchart-link{stroke:black;}T1T2T3';

async function pasteClipboard(page: Page, text: string, html = "") {
  await page.evaluate(
    ({ nextText, nextHtml }) => {
      const editor = document.querySelector(".ProseMirror");
      if (!editor) throw new Error("no editor");
      const data = new DataTransfer();
      data.setData("text/plain", nextText);
      if (nextHtml) data.setData("text/html", nextHtml);
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: data });
      editor.dispatchEvent(event);
    },
    { nextText: text, nextHtml: html },
  );
}

test.describe("Paste prefers markdown", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("markdown plus junk HTML becomes a heading and a list, not a pile of divs", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("keep");
    await page.keyboard.press("Enter");
    await pasteClipboard(page, MARKDOWN_DOC, JUNK_HTML);

    await expect(editor.getByText("keep")).toBeVisible();
    await expect(editor.locator("h1")).toHaveText("Hi");
    await expect(editor.locator("ul li")).toContainText("a");
    await expect(editor.locator("div").filter({ hasText: "# Hi" })).toHaveCount(0);
  });

  test("an HTML table plus TSV still pastes as a table", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await pasteClipboard(page, TABLE_TEXT, TABLE_HTML);

    await expect(editor.locator("table")).toHaveCount(1);
    await expect(editor.locator("table th").first()).toContainText("a");
    await expect(editor.locator("table td").first()).toContainText("1");
  });

  test("pasted GFM callout markdown becomes a callout, not a quote", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await pasteClipboard(page, "> [!note]\n> body from paste");

    await expect(editor.locator('[data-type="callout"]')).toHaveCount(1);
    await expect(editor.locator("blockquote")).toHaveCount(0);
    await expect(editor).toContainText("body from paste");
  });

  test("copying a rendered SVG with prose and math preserves the diagram as an image", async ({ page }) => {
    const html = `<p>Before diagram.</p><p><span class="katex"><math><semantics><mrow/><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span></p>${COPIED_DIAGRAM_SVG}<table><tr><td>Keep this table</td></tr></table><p>After diagram.</p>`;
    await pasteClipboard(page, `Before diagram.\nx²\n${FLATTENED_DIAGRAM_CSS}\nAfter diagram.`, html);
    const image = page.locator('.ProseMirror img[src^="data:image/svg+xml;base64,"]');
    await expect(image).toBeVisible();
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    await image.screenshot({ path: test.info().outputPath("copied-diagram.png") });
    await expect(page.locator(".ProseMirror .math-inline .katex")).toBeVisible();
    await expect(page.locator(".ProseMirror table")).toContainText("Keep this table");
    await expect(page.locator(".ProseMirror")).toContainText("After diagram.");
    await expect(page.getByTestId("stored-text")).toContainText("data:image/svg+xml;base64,");
    await expect(page.getByTestId("stored-text")).not.toContainText("#chatgpt-mermaid");
    await page.getByTestId("reload-from-markdown").click();
    await expect(image).toBeVisible();
  });

  test("a clipboard image file accompanying rendered SVG does not discard the surrounding note", async ({ page }) => {
    const html = `<p>Before diagram.</p>${COPIED_DIAGRAM_SVG}<p>After diagram.</p>`;
    await page.locator(".ProseMirror").evaluate((element, source) => {
      const data = new DataTransfer();
      data.setData("text/html", source);
      data.setData("text/plain", "Before diagram.\nT1T2\nAfter diagram.");
      data.items.add(new File(["unused bitmap representation"], "diagram.png", { type: "image/png" }));
      element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
    }, html);
    await expect(page.locator(".ProseMirror")).toContainText("Before diagram.");
    await expect(page.locator(".ProseMirror")).toContainText("After diagram.");
    await expect(page.locator('.ProseMirror img[src^="data:image/svg+xml;base64,"]')).toBeVisible();
  });

  test("rendered diagrams with source metadata stay editable Mermaid", async ({ page }) => {
    const html = `<p>Before.</p><div data-mermaid-source="flowchart LR&#10;T1 --&gt; T2">${COPIED_DIAGRAM_SVG}</div><p>After.</p>`;
    await pasteClipboard(page, "Before.\nT1T2\nAfter.", html);
    await expect(page.locator(".code-mermaid-svg svg")).toContainText("T1", { timeout: 15000 });
    await expect(page.locator(".code-block-content")).toContainText("T1 --> T2");
    await expect(page.getByTestId("stored-text")).toContainText("```mermaid");
  });

  test("flattened diagram CSS gets an explicit missing-diagram marker while keeping prose and labels", async ({ page }) => {
    await pasteClipboard(page, `Before diagram.\n\n${FLATTENED_DIAGRAM_CSS}\n\nConclusion: not conflict serializable.`);
    const editor = page.locator(".ProseMirror");
    await expect(editor).toContainText("Diagram missing from copy");
    await expect(editor).toContainText("T1T2T3");
    await expect(editor).toContainText("Conclusion: not conflict serializable.");
    await expect(editor).not.toContainText("stroke-dashoffset");
    await expect(page.getByText("Diagram source missing from clipboard", { exact: true })).toBeVisible();
    await page.getByTestId("reload-from-markdown").click();
    await expect(editor).toContainText("Diagram missing from copy");
  });

  test("the full copied worked problem rebuilds escaped diagram CSS from its explicit Edge table", async ({ page }) => {
    const escapedCss = FLATTENED_DIAGRAM_CSS.replace(/_/g, "\\_").replace(/^#/, "\\#");
    const note = [
      "## Module 2 · Step 10: Final two worked problems",
      "**These cover a cycle involving three transactions and a schedule with multiple equivalent serial orders.**",
      "### Problem 3: A cycle across three transactions",
      "```scss\n1. r₁(A)\n2. r₂(B)\n3. r₃(C)\n4. w₂(A)\n5. w₃(B)\n6. w₁(C)\n```",
      "Find conflicts **item by item**:",
      "| Item | Earlier operation → later operation | Edge |\n| --- | --- | --- |\n| A | `r₁(A)` → `w₂(A)` | T1 → T2 |\n| B | `r₂(B)` → `w₃(B)` | T2 → T3 |\n| C | `r₃(C)` → `w₁(C)` | T3 → T1 |",
      escapedCss,
      "**Conclusion: not conflict serializable.**",
      "No pair has arrows in both directions, but the **three transactions together form a cycle**.",
      "### Problem 4: More than one equivalent serial order",
      "```scss\n1. r₁(A)\n2. r₂(B)\n3. w₁(A)\n4. w₂(B)\n5. r₃(A)\n6. r₃(B)\n7. w₃(C)\n```",
      "| Item | Earlier operation → later operation | Edge |\n| --- | --- | --- |\n| A | `w₁(A)` → `r₃(A)` | T1 → T3 |\n| B | `w₂(B)` → `r₃(B)` | T2 → T3 |\n| C | Only T3 accesses C | None |",
      "The constraints are:",
      "```\nT1 before T3\nT2 before T3\n```",
      "| Order 1 | Order 2 |\n| --- | --- |\n| T1 → T2 → T3 | T2 → T1 → T3 |",
      "**Module 2 complete: all 10 steps and four worked problems.**",
    ].join("\n\n");
    await pasteClipboard(page, note);
    const editor = page.locator(".ProseMirror");
    const diagram = editor.locator('.code-block-wrapper[data-language="mermaid"]');
    await expect(diagram.locator(".code-mermaid-svg svg")).toContainText("T1", { timeout: 15000 });
    await expect(diagram.locator(".code-mermaid-svg svg")).toContainText("T2");
    await expect(diagram.locator(".code-mermaid-svg svg")).toContainText("T3");
    await expect(diagram.locator(".code-block-content")).toContainText("T3 --> T1");
    await expect(editor.locator("table")).toHaveCount(3);
    await expect(editor.locator('.code-block-wrapper[data-language="scss"]')).toHaveCount(2);
    await expect(editor).toContainText("Module 2 complete");
    await expect(editor).not.toContainText("chatgpt-mermaid");
    await expect(page.getByText("Diagram rebuilt from the Edge table", { exact: true })).toBeVisible();
    const stored = page.getByTestId("stored-text");
    await expect(stored).toContainText("T1 --> T2");
    await expect(stored).toContainText("T2 --> T3");
    await expect(stored).toContainText("T3 --> T1");
    await expect(stored).not.toContainText("chatgpt-mermaid");
    await expect(stored).not.toContainText("stroke-dashoffset");
    const before = await stored.textContent();
    await page.getByTestId("reload-from-markdown").click();
    await expect(diagram.locator(".code-mermaid-svg svg")).toBeVisible({ timeout: 15000 });
    await expect(editor.locator("table")).toHaveCount(3);
    await expect(stored).toHaveText(before!);
  });

  for (const clipboard of [
    { name: "raw Markdown", text: MIXED_MARKDOWN, html: "" },
    { name: "Markdown with rich-text clipboard HTML", text: MIXED_MARKDOWN, html: JUNK_HTML },
    { name: "selected rendered text with annotated math", text: MIXED_RENDERED_TEXT, html: MIXED_RENDERED_HTML },
  ]) {
    test(`one paste of ${clipboard.name} renders prose, LaTeX and Mermaid together`, async ({ page }) => {
      await pasteClipboard(page, clipboard.text, clipboard.html);
      const editor = page.locator(".ProseMirror");
      const assertContent = async () => {
        await expect(editor).toContainText("Introductory prose before the formula.");
        await expect(editor).toContainText("Closing prose after the diagram.");
        await expect(editor.locator(".math-inline .katex")).toHaveCount(1);
        await expect(editor.locator(".math-block .katex")).toHaveCount(1);
        await expect(editor.locator(".code-mermaid-svg svg")).toContainText("Input", { timeout: 15000 });
        await expect(editor.locator(".code-mermaid-svg svg")).toContainText("Output");
      };
      await assertContent();
      const stored = page.getByTestId("stored-text");
      await expect(stored).toContainText("```mermaid");
      await expect(stored).toContainText("\\frac{1}{2}");
      await expect(stored).not.toContainText("<svg");
      const before = await stored.textContent();
      expect(before!.indexOf("Introductory prose")).toBeLessThan(before!.indexOf("\\frac{1}{2}"));
      expect(before!.indexOf("\\frac{1}{2}")).toBeLessThan(before!.indexOf("```mermaid"));
      expect(before!.indexOf("```mermaid")).toBeLessThan(before!.indexOf("Closing prose"));
      await page.getByTestId("reload-from-markdown").click();
      await assertContent();
      await expect(stored).toHaveText(before!);
    });
  }
});
