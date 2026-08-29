import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

async function insertLinkAtCaret(
  page: import("@playwright/test").Page,
  text: string,
  href: string,
) {
  await page.keyboard.type(text);
  await page.evaluate(
    ({ count, url }) => {
      const editor = (
        window as unknown as {
          __nw_editor: {
            commands: {
              setTextSelection: (range: { from: number; to: number }) => void;
              setLink: (attrs: { href: string }) => void;
            };
            state: { selection: { from: number } };
          };
        }
      ).__nw_editor;
      const to = editor.state.selection.from;
      editor.commands.setTextSelection({ from: to - count, to });
      editor.commands.setLink({ href: url });
      editor.commands.setTextSelection(to - Math.floor(count / 2));
    },
    { count: text.length, url: href },
  );
}

test.describe("Link toolbar", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("caret in a link shows Open, Copy, Unlink", async ({ page }) => {
    await insertLinkAtCaret(page, "hello", "https://example.com");
    const toolbar = page.getByTestId("link-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(page.getByRole("button", { name: "Open" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy URL" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Unlink" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn into bookmark" })).toBeVisible();
  });

  test("Unlink keeps the text and removes the anchor", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await insertLinkAtCaret(page, "hello", "https://example.com");
    await expect(page.getByTestId("link-toolbar")).toBeVisible();
    await page.getByRole("button", { name: "Unlink" }).click();
    await expect(editor.locator("a.editor-link")).toHaveCount(0);
    await expect(editor).toContainText("hello");
  });

  test("Copy URL writes the href", async ({ page }) => {
    await insertLinkAtCaret(page, "hello", "https://example.com");
    await expect(page.getByTestId("link-toolbar")).toBeVisible();
    await page.getByRole("button", { name: "Copy URL" }).click();
    await expect
      .poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).trim())
      .toMatch(/^https:\/\/example\.com\/?$/);
  });

  test("Turn into bookmark replaces the link", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await insertLinkAtCaret(page, "hello", "https://example.com");
    await expect(page.getByTestId("link-toolbar")).toBeVisible();
    await page.getByRole("button", { name: "Turn into bookmark" }).click();
    await expect(editor.locator('[data-type="bookmark"]')).toHaveCount(1);
    await expect(editor.locator("a.editor-link")).toHaveCount(0);
  });

  test("clicking a card selects it without navigating", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await insertLinkAtCaret(page, "hello", "https://example.com");
    await page.getByRole("button", { name: "Turn into bookmark" }).click();
    const card = editor.getByTestId("link-card");
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/__editor-e2e/);
    await expect(page.getByTestId("card-toolbar")).toBeVisible();
  });

  test("Inline view turns a card back into a link", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await insertLinkAtCaret(page, "hello", "https://example.com");
    await page.getByRole("button", { name: "Turn into bookmark" }).click();
    await editor.getByTestId("link-card").click();
    await expect(page.getByTestId("card-toolbar")).toBeVisible();
    await page.getByRole("button", { name: "Inline view" }).click();
    await expect(editor.locator('[data-type="bookmark"]')).toHaveCount(0);
    await expect(editor.locator("a.editor-link")).toHaveCount(1);
  });

  test("Backspace on a selected card deletes it", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await insertLinkAtCaret(page, "hello", "https://example.com");
    await page.getByRole("button", { name: "Turn into bookmark" }).click();
    await editor.getByTestId("link-card").click();
    await page.keyboard.press("Backspace");
    await expect(editor.locator('[data-type="bookmark"]')).toHaveCount(0);
  });

  test("insertBookmark still creates a card", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.evaluate(() => {
      const ed = (window as unknown as { __nw_editor: { commands: { insertBookmark: (attrs: { url: string }) => boolean } } }).__nw_editor;
      ed.commands.insertBookmark({ url: "https://example.com" });
    });
    await expect(editor.locator('[data-type="bookmark"]')).toHaveCount(1);
  });

  test("slash menu Enter still inserts a callout", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/callout");
    await expect(page.locator(".slash-menu button", { hasText: "Callout" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(editor.locator('[data-type="callout"]')).toHaveCount(1);
  });
});
