import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

const KEEP = "kestrel-keep-9f3";

test.describe("Editor appearance", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("nw:editor-appearance");
    });
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem("nw:editor-appearance"));
  });

  test("font and size are CSS only — stored text is unchanged", async ({ page }) => {
    await page.keyboard.type(KEEP);
    await expect(page.getByTestId("stored-text")).toContainText(KEEP);

    await page.getByTestId("appearance-serif").click();
    await page.getByTestId("appearance-size-20").click();

    const content = page.locator(".block-editor-content");
    await expect.poll(async () => content.evaluate((el) => getComputedStyle(el).fontSize)).toBe("20px");
    await expect
      .poll(async () => content.evaluate((el) => getComputedStyle(el).fontFamily))
      .toMatch(/Georgia/i);
    await expect(page.locator(".ProseMirror")).toContainText(KEEP);
    await expect(page.getByTestId("stored-text")).toContainText(KEEP);
    await expect(page.getByTestId("markdown-preview")).toContainText(KEEP);
    await expect(page.getByTestId("ai-request-text")).toContainText(KEEP);
  });

  test("new fences pick up wrap; slash still inserts a callout", async ({ page }) => {
    await page.keyboard.type(KEEP);
    await expect(page.getByTestId("stored-text")).toContainText(KEEP);

    await page.getByTestId("appearance-code-wrap").click();
    await focusEditor(page);
    await page.evaluate(() => {
      (
        window as unknown as {
          __nw_editor: { commands: { focus: (pos: string) => boolean } };
        }
      ).__nw_editor.commands.focus("end");
    });
    await page.keyboard.press("Enter");
    await page.keyboard.type("```ts ");
    await expect(page.locator(".code-block-wrapper")).toHaveAttribute("data-wrap", "true");
    await expect(page.getByTestId("stored-text")).toContainText(KEEP);

    await page.evaluate(() => {
      (
        window as unknown as {
          __nw_editor: { commands: { focus: (pos: string) => boolean } };
        }
      ).__nw_editor.commands.focus("end");
    });
    await page.keyboard.type("/callout");
    const calloutItem = page.locator(".slash-menu button", { hasText: "Callout" });
    await expect(calloutItem).toBeVisible();
    await calloutItem.click();
    await expect(page.locator('[data-type="callout"]')).toHaveCount(1);
    await expect(page.getByTestId("stored-text")).toContainText(KEEP);
  });
});
