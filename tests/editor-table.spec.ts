import { expect, test, type Page } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

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

async function insertTable(page: Page) {
  await page.keyboard.type("/table");
  const tableItem = page.getByRole("button", { name: "Table Add a simple table" });
  await expect(tableItem).toBeVisible();
  await tableItem.click();
  await expect(page.locator(".ProseMirror table")).toHaveCount(1);
}

test.describe("Tables", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("Tab moves to the next cell", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await insertTable(page);
    await page.keyboard.type("A");
    await page.keyboard.press("Tab");
    await page.keyboard.type("B");
    const cells = editor.locator("table th, table td");
    await expect(cells.nth(0)).toContainText("A");
    await expect(cells.nth(1)).toContainText("B");
  });

  test("delete row and delete column shrink the table", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await insertTable(page);
    await expect(page.getByTestId("table-menu")).toBeVisible();
    await expect(editor.locator("table tr")).toHaveCount(3);
    await page.getByRole("button", { name: "Delete row" }).click();
    await expect(editor.locator("table tr")).toHaveCount(2);
    await expect(editor.locator("table tr").first().locator("th, td")).toHaveCount(3);
    await page.getByRole("button", { name: "Delete column" }).click();
    await expect(editor.locator("table tr").first().locator("th, td")).toHaveCount(2);
  });

  test("toggle header row turns th into td", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await insertTable(page);
    await expect(editor.locator("table th")).toHaveCount(3);
    await page.getByRole("button", { name: "Toggle header row" }).click();
    await expect(editor.locator("table th")).toHaveCount(0);
    await expect(editor.locator("table tr").first().locator("td")).toHaveCount(3);
  });

  test("TSV outside a table inserts a table", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await pasteClipboard(page, "Name\tAge\nAda\t36");
    await expect(editor.locator("table")).toHaveCount(1);
    await expect(editor.locator("table")).toContainText("Name");
    await expect(editor.locator("table")).toContainText("Ada");
  });

  test("TSV inside a table fills cells", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await insertTable(page);
    await pasteClipboard(page, "x\ty\n1\t2");
    await expect(editor.locator("table")).toHaveCount(1);
    await expect(editor.locator("table")).toContainText("x");
    await expect(editor.locator("table")).toContainText("1");
  });
});
