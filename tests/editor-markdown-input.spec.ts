import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

test.describe("Markdown input on space", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("type [ ] space becomes a to-do", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("[ ] ");
    await expect(editor.locator('[data-type="taskItem"], ul[data-type="taskList"] li')).toHaveCount(1);
  });

  test("type [x] space becomes a checked to-do", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("[x] ");
    const checked = await page.evaluate(() => {
      const ed = (window as unknown as { __nw_editor: { state: { doc: { descendants: (fn: (node: { type: { name: string }; attrs: { checked?: boolean } }) => void) => void } } } }).__nw_editor;
      let found = false;
      ed.state.doc.descendants((node) => {
        if (node.type.name === "taskItem" && node.attrs.checked) found = true;
      });
      return found;
    });
    expect(checked).toBe(true);
    await expect(editor).not.toContainText("[x]");
  });

  test("type ```ts space becomes a typescript fence", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("```ts ");
    await expect(editor.locator("pre .code-block-content")).toBeVisible();
    await expect(editor.locator(".code-block-wrapper")).toHaveAttribute("data-language", "typescript");
  });

  test("type **hi** space becomes bold without asterisks", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("**hi** ");
    await expect(editor.locator("strong")).toHaveText("hi");
    await expect(editor).not.toContainText("**");
  });

  test("type ***hi*** space becomes bold italic", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("***hi*** ");
    await expect(editor.locator("strong")).toContainText("hi");
    await expect(editor.locator("em")).toContainText("hi");
    await expect(editor).not.toContainText("***");
  });

  test("type ~~hi~~ space becomes strike", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("~~hi~~ ");
    await expect(editor.locator("s, del, strike")).toContainText("hi");
  });

  test("type four underscores then space inserts a divider", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("____ ");
    await expect(editor.locator("hr, .editor-hr")).toHaveCount(1);
  });

  test("type > [!note] space becomes a callout, not a leftover quote", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("> [!note] ");
    await expect(editor.locator('[data-type="callout"]')).toHaveCount(1);
    await expect(editor.locator("blockquote")).toHaveCount(0);
  });

  test("slash menu Enter still inserts a callout", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/callout");
    await expect(page.locator(".slash-menu button", { hasText: "Callout" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(editor.locator('[data-type="callout"]')).toHaveCount(1);
  });
});
