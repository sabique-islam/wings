import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

test.describe("External link paste", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("pasting a bare URL inserts an inline link, not a bookmark", async ({ page }) => {
    const url = "https://github.com/org/repo";
    const editor = page.locator(".ProseMirror");

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(async (pasteUrl) => {
      await navigator.clipboard.writeText(pasteUrl);
    }, url);
    await page.keyboard.press("Meta+v");

    await expect(editor.locator('[data-type="bookmark"]')).toHaveCount(0);
    await expect(editor.locator("a.editor-link")).toHaveCount(1);
    await expect(editor.locator("a.editor-link")).toHaveAttribute("href", url);
    await expect(editor).toContainText(url);

    await page.keyboard.type(" hello");
    await expect(editor.locator("a.editor-link")).toHaveText(url);
    await expect(editor).toContainText("hello");
  });

  test("typing a URL then space still autolinks", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("https://example.com ");
    await expect(editor.locator("a.editor-link")).toHaveCount(1);
    await expect(editor.locator("a.editor-link")).toHaveAttribute("href", "https://example.com");
  });
});
