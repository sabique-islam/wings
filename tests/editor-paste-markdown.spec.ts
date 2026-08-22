import { expect, test, type Page } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

const MARKDOWN_DOC = "# Hi\n\n- a";
const JUNK_HTML = `<meta charset="utf-8"><div style="font-family:Menlo"><div># Hi</div><div><br></div><div>- a</div></div>`;
const TABLE_HTML =
  "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>";
const TABLE_TEXT = "a\tb\n1\t2";

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
});
