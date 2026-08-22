import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

test.describe("Mobile keyboard toolbar", () => {
  test("desktop viewport does not show the bar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/__editor-e2e");
    await focusEditor(page);
    await expect(page.getByTestId("mobile-keyboard-toolbar")).toHaveCount(0);
  });

  test.describe("phone viewport", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/__editor-e2e");
      await focusEditor(page);
    });

    test("mousedown on a button does not blur the editor", async ({ page }) => {
      const editor = page.locator(".ProseMirror");
      await expect(page.getByTestId("mobile-keyboard-toolbar")).toBeVisible();
      await page.keyboard.type("hello");
      await page.getByRole("button", { name: "Bold" }).dispatchEvent("mousedown");
      const focused = await page.evaluate(() =>
        document.activeElement?.classList.contains("ProseMirror"),
      );
      expect(focused).toBe(true);
      await expect(editor).toContainText("hello");
    });

    test("Bold toggles the mark without opening the bubble menu", async ({ page }) => {
      const editor = page.locator(".ProseMirror");
      await page.keyboard.type("hello");
      await page.keyboard.press("ControlOrMeta+A");
      await page.getByRole("button", { name: "Bold" }).click();
      await expect(editor.locator("strong")).toHaveText("hello");
      await expect(page.locator(".bubble-menu")).toHaveCount(0);
    });

    test("slash button opens the command menu", async ({ page }) => {
      await page.getByRole("button", { name: "Slash commands" }).click();
      await expect(page.locator(".slash-menu")).toBeVisible();
      await expect(page.locator(".slash-menu button", { hasText: "Callout" })).toBeVisible();
    });
  });
});
