import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

test.describe("weekly planner", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("slash inserts a week grid that New week extends", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/weekly");
    const item = page.locator(".slash-menu button", { hasText: "Weekly planner" });
    await expect(item).toBeVisible();
    await item.click();

    await expect(page.getByTestId("template-button")).toHaveCount(1);
    await expect(editor.locator("h2", { hasText: /Week \d+/ })).toHaveCount(1);
    await expect(editor.locator('[data-type="column-list"]')).toHaveCount(2);
    await expect(editor.locator('[data-type="column"]')).toHaveCount(10);
    await expect(editor.getByText("Sunday", { exact: true })).toBeVisible();
    await expect(editor.getByText("Groceries", { exact: true })).toBeVisible();

    await page.getByTestId("template-button").click();
    await expect(editor.locator("h2", { hasText: /Week \d+/ })).toHaveCount(2);
    await expect(editor.locator('[data-type="column-list"]')).toHaveCount(4);
  });

  test("slash inserts five columns", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/5c");
    const item = page.locator(".slash-menu button", { hasText: "Five columns" });
    await expect(item).toBeVisible();
    await item.click();
    await expect(editor.locator('[data-type="column-list"]')).toHaveCount(1);
    await expect(editor.locator('[data-type="column"]')).toHaveCount(5);
  });
});
