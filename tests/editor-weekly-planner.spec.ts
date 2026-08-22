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

    const firstWeek = editor.locator("h2", { hasText: /Week \d+/ }).first();
    await firstWeek.locator(".nw-heading-fold").click();
    await expect(editor.getByText("Sunday", { exact: true }).first()).toBeHidden();
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

  test(":: grips resize columns", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/2col");
    const item = page.locator(".slash-menu button", { hasText: "Two columns" });
    await expect(item).toBeVisible();
    await item.click();

    const list = editor.locator('[data-type="column-list"]').first();
    await list.hover();
    const gap = list.locator(".nw-col-gap").first();
    await expect(gap).toBeVisible();
    const box = await gap.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(list).toHaveAttribute("data-widths", /,/);
  });
});
