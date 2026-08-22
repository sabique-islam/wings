import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

async function selectTyped(page: import("@playwright/test").Page, length: number) {
  await page.evaluate((count) => {
    const editor = (window as unknown as { __nw_editor: { commands: { setTextSelection: (range: { from: number; to: number }) => void }; state: { selection: { from: number } } } }).__nw_editor;
    const to = editor.state.selection.from;
    editor.commands.setTextSelection({ from: to - count, to });
  }, length);
}

async function selectedText(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const editor = (window as unknown as { __nw_editor: { state: { selection: { from: number; to: number }; doc: { textBetween: (from: number, to: number) => string } } } }).__nw_editor;
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to);
  });
}

test.describe("Selection wrapping", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("backtick around a selection becomes inline code", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("foo");
    await selectTyped(page, 3);
    await page.keyboard.press("`");
    await expect(editor.locator("code")).toHaveText("foo");
    await expect(editor).not.toContainText("`");
  });

  test("opening bracket wraps the selection and keeps it selected", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("foo");
    await selectTyped(page, 3);
    await page.keyboard.press("[");
    await expect(editor).toContainText("[foo]");
    expect(await selectedText(page)).toBe("foo");
  });

  test("a second bracket around a known title becomes a page chip", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("Reading List");
    await selectTyped(page, "Reading List".length);
    await page.keyboard.press("[");
    await page.keyboard.press("[");
    await expect(editor.locator('[data-type="page-ref"]')).toHaveText("Reading List");
  });

  test("collapsed parenthesis in a paragraph does not auto-close", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("a");
    await page.keyboard.press("(");
    await expect(editor.locator("p").first()).toContainText("a(");
    await expect(editor.locator("p").first()).not.toContainText("a()");
  });

  test("in a code block a typed closer skips the auto-inserted pair", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("``` ");
    await expect(editor.locator("pre .code-block-content")).toBeVisible();
    await page.keyboard.press("(");
    await expect(editor.locator("pre .code-block-content")).toContainText("()");
    await page.keyboard.press(")");
    await expect(editor.locator("pre .code-block-content")).toContainText("()");
    await expect(editor.locator("pre .code-block-content")).not.toContainText("())");
  });

  test("slash still opens the command menu", async ({ page }) => {
    await page.keyboard.type("/");
    await expect(page.locator(".slash-menu")).toBeVisible();
  });
});
