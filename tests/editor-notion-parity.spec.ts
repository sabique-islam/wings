import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

test.describe("Notion parity keyboard and blocks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("Backspace on empty second paragraph merges upward", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("hello");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Backspace");
    await expect(editor.locator("p").filter({ hasText: "hello" })).toHaveCount(1);
    await expect(editor.locator("p").first()).toContainText("hello");
    const caret = await page.evaluate(() => {
      const ed = (window as unknown as { __nw_editor: { state: { selection: { from: number } } } }).__nw_editor;
      return ed.state.selection.from;
    });
    expect(caret).toBe(6);
  });

  test("slash inserts callout block", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/callout");
    const calloutItem = page.locator(".slash-menu button", { hasText: "Callout" });
    await expect(calloutItem).toBeVisible();
    await calloutItem.click();
    await expect(editor.locator('[data-type="callout"]')).toHaveCount(1);
    const emptyParagraphBeforeCallout = await page.evaluate(() => {
      const root = document.querySelector(".ProseMirror");
      if (!root) return true;
      for (const el of Array.from(root.children)) {
        if (
          el.getAttribute("data-type") === "callout" ||
          el.classList.contains("callout-block") ||
          el.querySelector('[data-type="callout"]')
        ) {
          return false;
        }
        if (el.tagName === "P" && !(el.textContent ?? "").trim()) return true;
      }
      return true;
    });
    expect(emptyParagraphBeforeCallout).toBe(false);
  });

  test("slash inserts toggle block", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/toggle");
    const toggleItem = page.getByRole("button", { name: "Toggle Collapsible content" });
    await expect(toggleItem).toBeVisible();
    await toggleItem.click();
    await expect(editor.locator('[data-type="toggle"]')).toHaveCount(1);
  });

  test("Cmd+D duplicates block", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("duplicate me");
    await page.keyboard.press("Meta+d");
    const filled = editor.locator("p").filter({ hasText: "duplicate me" });
    await expect(filled).toHaveCount(2);
  });

  test("Enter picks the highlighted page in the @ menu instead of splitting the block", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("@Reading");
    await expect(page.getByRole("button", { name: "Reading List" })).toBeVisible();

    await page.keyboard.press("Enter");

    await expect(editor.locator('a[href="#page:page-reading-list"]')).toHaveCount(1);
    await expect(editor.locator("p")).toHaveCount(1);
  });

  test("Enter picks the highlighted slash command instead of splitting the block", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/callout");
    await expect(page.locator(".slash-menu button", { hasText: "Callout" })).toBeVisible();

    await page.keyboard.press("Enter");

    await expect(editor.locator('[data-type="callout"]')).toHaveCount(1);
  });

  test("Esc selects current block", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("block one");
    await page.keyboard.press("Escape");
    await expect(editor.locator(".ProseMirror-selectednode, .nw-block-selected")).toHaveCount(1);
  });

  test("arrow keys move the block selection once a block is selected", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("first");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second");
    await page.keyboard.press("Escape");

    await page.keyboard.press("ArrowUp");
    await expect(editor.locator(".nw-block-selected")).toHaveText("first");

    await page.keyboard.press("ArrowDown");
    await expect(editor.locator(".nw-block-selected")).toHaveText("second");
  });

  test("Shift+Arrow extends and shrinks the block selection", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("first");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second");
    await page.keyboard.press("Enter");
    await page.keyboard.type("third");
    await page.keyboard.press("Escape");

    await page.keyboard.press("Shift+ArrowUp");
    await expect(editor.locator(".nw-block-selected")).toHaveCount(2);

    await page.keyboard.press("Shift+ArrowUp");
    await expect(editor.locator(".nw-block-selected")).toHaveCount(3);

    await page.keyboard.press("Shift+ArrowDown");
    await expect(editor.locator(".nw-block-selected")).toHaveCount(2);
  });

  test("Tab stays in the editor instead of focusing the gutter handle", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("stay here");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.className ?? "");
    expect(focused).toContain("ProseMirror");
    await expect(editor).toContainText("stay here");
  });

  test("Enter after a heading creates a paragraph, not another heading", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("# Title");
    await expect(editor.locator("h1")).toContainText("Title");
    await page.keyboard.press("Enter");
    await expect(editor.locator("h1")).toHaveCount(1);
    await page.keyboard.type("body");
    await expect(editor.locator("h1")).toHaveText("Title");
    await expect(editor.locator("p").filter({ hasText: "body" })).toHaveCount(1);
  });

  test("typing --- then Enter inserts a divider", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("---");
    await page.keyboard.press("Enter");
    await expect(editor.locator("hr, .editor-hr")).toHaveCount(1);
  });

  test("greater-than space becomes a quote, not a callout", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("> ");
    await expect(editor.locator("blockquote")).toHaveCount(1);
    await expect(editor.locator('[data-type="callout"]')).toHaveCount(0);
  });

  test("Backspace after adding a bullet does not delete the pasted list", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    const markdown = `## Red Flags

* I research proposals deeply
* I can prioritize being right
* I have low tolerance for sloppy thinking`;

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(async (pasteText) => {
      await navigator.clipboard.writeText(pasteText);
    }, markdown);
    await page.keyboard.press("Meta+v");

    await expect(editor.locator("h2")).toContainText("Red Flags");
    await expect(editor.locator("li")).toHaveCount(3);

    await editor.locator("li").last().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Backspace");

    await expect(editor.locator("h2")).toContainText("Red Flags");
    await expect(editor.locator("li")).toHaveCount(3);
    await expect(editor).toContainText("I research proposals deeply");
    await expect(editor).toContainText("I can prioritize being right");
    await expect(editor).toContainText("I have low tolerance for sloppy thinking");
  });

  test("Tab nests a paragraph under the previous one", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("hello");
    await page.keyboard.press("Enter");
    await page.keyboard.type("world");
    await page.keyboard.press("Tab");

    await expect(editor.locator('[data-type="paragraph"]')).toContainText("hello");
    await expect(editor.locator('[data-type="paragraph"] > p').filter({ hasText: "world" })).toHaveCount(1);
  });

  test("Shift-Tab lifts a nested paragraph back to the top level", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("hello");
    await page.keyboard.press("Enter");
    await page.keyboard.type("world");
    await page.keyboard.press("Tab");
    await expect(editor.locator('[data-type="paragraph"] > p').filter({ hasText: "world" })).toHaveCount(1);

    await page.keyboard.press("Shift+Tab");
    await expect(editor.locator('[data-type="paragraph"]')).toHaveCount(0);
    await expect(editor.locator("p").filter({ hasText: "world" })).toHaveCount(1);
  });

  test("Tab on a bullet still nests the list", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("- alpha");
    await page.keyboard.press("Enter");
    await page.keyboard.type("beta");
    await page.keyboard.press("Tab");

    await expect(editor.locator("ul ul li")).toContainText("beta");
  });

  test("Tab in a table does not indent the table", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("hello");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/table");
    const tableItem = page.getByRole("button", { name: "Table Add a simple table" });
    await expect(tableItem).toBeVisible();
    await tableItem.click();
    await expect(editor.locator("table")).toHaveCount(1);

    await page.keyboard.press("Tab");
    await expect(editor.locator("table")).toHaveCount(1);
    await expect(editor.locator('[data-type="paragraph"] table')).toHaveCount(0);
  });

  test("nested paragraphs survive reload from markdown", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("hello");
    await page.keyboard.press("Enter");
    await page.keyboard.type("world");
    await page.keyboard.press("Tab");
    await expect(editor.locator('[data-type="paragraph"] > p').filter({ hasText: "world" })).toHaveCount(1);

    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId("stored-text")).toContainText("data-type=\"paragraph\"");

    await page.getByTestId("reload-from-markdown").click();
    await expect(page.locator('.ProseMirror [data-type="paragraph"] > p').filter({ hasText: "world" })).toHaveCount(1);
  });
});
