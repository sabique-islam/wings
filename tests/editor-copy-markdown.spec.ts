import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

test.describe("Copy as markdown", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("⌘⇧C copies the current block, not the whole page", async ({ page }) => {
    await page.keyboard.type("hello");
    await page.keyboard.press("Enter");
    await page.keyboard.type("world");
    await page.keyboard.press("Meta+Shift+c");

    await expect
      .poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).trim())
      .toBe("world");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).not.toContain("hello");
    await expect(page.locator(".ProseMirror")).toContainText("hello");
    await expect(page.locator(".ProseMirror")).toContainText("world");
  });

  test("⌘⇧C copies the highlighted selection", async ({ page }) => {
    await page.keyboard.type("hello world");
    await page.evaluate(() => {
      const ed = (window as unknown as { __nw_editor: { commands: { setTextSelection: (range: { from: number; to: number }) => void } } }).__nw_editor;
      ed.commands.setTextSelection({ from: 7, to: 12 });
    });
    await page.keyboard.press("Meta+Shift+c");

    await expect
      .poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).trim())
      .toBe("world");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).not.toContain("hello");
  });

  test("slash menu Enter still inserts a callout", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/callout");
    await expect(page.locator(".slash-menu button", { hasText: "Callout" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(editor.locator('[data-type="callout"]')).toHaveCount(1);
  });
});
