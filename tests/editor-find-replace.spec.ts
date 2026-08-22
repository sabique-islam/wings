import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

test.describe("Find and replace", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("⌘F walks each match", async ({ page }) => {
    await page.keyboard.type("alpha alpha alpha");
    await page.keyboard.press("Meta+f");

    const bar = page.getByTestId("find-replace-bar");
    await expect(bar).toBeVisible();
    await page.getByTestId("find-query").fill("alpha");
    await expect(page.getByTestId("find-count")).toHaveText("1 of 3");

    await page.getByTestId("find-next").click();
    await expect(page.getByTestId("find-count")).toHaveText("2 of 3");
    await page.getByTestId("find-next").click();
    await expect(page.getByTestId("find-count")).toHaveText("3 of 3");
    await page.getByTestId("find-next").click();
    await expect(page.getByTestId("find-count")).toHaveText("1 of 3");
  });

  test("replace one leaves the other matches", async ({ page }) => {
    await page.keyboard.type("alpha alpha alpha");
    await page.keyboard.press("Meta+f");
    await page.getByTestId("find-query").fill("alpha");
    await page.getByTestId("find-replace-input").fill("beta");
    await page.getByTestId("find-replace-one").click();

    await expect(page.locator(".ProseMirror p")).toContainText("beta");
    await expect(page.getByTestId("find-count")).toHaveText("1 of 2");
  });

  test("replace all swaps every match", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("alpha alpha");
    await page.keyboard.press("Meta+f");
    await page.getByTestId("find-query").fill("alpha");
    await page.getByTestId("find-replace-input").fill("beta");
    await page.getByTestId("find-replace-all").click();

    await expect(editor).toHaveText(/beta beta/);
    await expect(editor).not.toContainText("alpha");
  });

  test("replace all that would clear a long page is refused", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("a".repeat(25));
    await page.keyboard.press("Meta+f");
    await page.getByTestId("find-query").fill("a");
    await page.getByTestId("find-replace-input").fill("");
    await page.getByTestId("find-replace-all").click();

    await expect(page.getByTestId("find-replace-blocked")).toBeVisible();
    await expect(editor).toHaveText("a".repeat(25));
  });

  test("Escape closes the bar", async ({ page }) => {
    await page.keyboard.type("hello");
    await page.keyboard.press("Meta+f");
    await expect(page.getByTestId("find-replace-bar")).toBeVisible();
    await page.getByTestId("find-query").press("Escape");
    await expect(page.getByTestId("find-replace-bar")).toHaveCount(0);
  });
});
