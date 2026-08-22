import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

async function expectParity(page: import("@playwright/test").Page) {
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const text = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? "";
        const stored = text("stored-text");
        const preview = text("markdown-preview");
        const aiText = text("ai-request-text");
        return stored === preview && stored === aiText;
      });
    }, { timeout: 3000 })
    .toBe(true);
}

test("Enter, Shift+Enter, Markdown rendering, and AI parity survive the full editor stack", async ({ page }) => {
  await page.goto("/__editor-e2e");

  const editor = await focusEditor(page);
  await expect(editor).toBeVisible();

  await page.keyboard.type("alpha");
  await expectParity(page);

  await page.keyboard.press("Enter");
  await page.keyboard.type("beta");
  await expect(editor.locator("p")).toHaveCount(2);
  await expect(editor.locator("p").nth(0)).toContainText("alpha");
  await expect(editor.locator("p").nth(1)).toContainText("beta");
  await expectParity(page);

  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("gamma");
  await expect(editor.locator("p")).toHaveCount(2);
  await expect(editor.locator("br")).toHaveCount(1);
  await expect(editor.locator("p").nth(1)).toContainText("beta");
  await expect(editor.locator("p").nth(1)).toContainText("gamma");
  await expectParity(page);

  await page.keyboard.press("Enter");
  await page.keyboard.type("# Heading");
  await expect(editor.locator("h1")).toContainText("Heading");
  await expectParity(page);

  await page.keyboard.press("Enter");
  await page.keyboard.type("- item one");
  await expect(editor.locator("ul li")).toContainText("item one");
  await expectParity(page);

  await page.keyboard.press("Enter");
  await page.keyboard.type("item two");
  await expect(editor.locator("ul li")).toHaveCount(2);
  await expect(editor.locator("ul li").nth(1)).toContainText("item two");
  await expectParity(page);

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("**bold**");
  await expect(editor.locator("strong")).toContainText("bold");
  await expectParity(page);

  await page.keyboard.press("Enter");
  await page.keyboard.type("```ts");
  await page.keyboard.press("Enter");
  await expect(editor.locator("pre .code-block-content")).toBeVisible();
  await page.keyboard.type("const x = 1;");
  await expect(editor.locator("pre .code-block-content")).toContainText("const x = 1;");
  await expectParity(page);
});

test("pasting multi-line code stays inside the code block", async ({ page }) => {
  await page.goto("/__editor-e2e");
  const editor = await focusEditor(page);

  await page.keyboard.type("```");
  await page.keyboard.press("Enter");
  await expect(editor.locator("pre .code-block-content")).toBeVisible();

  const code = "class Solution {\npublic:\n    int x;\n};";
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(async (pasteText) => {
    await navigator.clipboard.writeText(pasteText);
  }, code);
  await page.keyboard.press("Meta+v");

  await expect(editor.locator("pre .code-block-content")).toBeVisible();
  await expect(editor.locator("pre .code-block-content")).toContainText("class Solution");
  await expect(editor.locator("pre .code-block-content")).toContainText("public:");

  const codeEscapedToParagraph = await page.evaluate(() => {
    const root = document.querySelector(".ProseMirror");
    if (!root) return false;
    return Array.from(root.children).some(
      (el) => el.tagName === "P" && (el.textContent ?? "").includes("class Solution"),
    );
  });
  expect(codeEscapedToParagraph).toBe(false);
});

test("Shift+Enter inside a code block stays in the fence", async ({ page }) => {
  await page.goto("/__editor-e2e");
  const editor = await focusEditor(page);

  await page.keyboard.type("```");
  await page.keyboard.press("Enter");
  await expect(editor.locator("pre .code-block-content")).toBeVisible();
  await page.keyboard.type("line1");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("line2");

  await expect(editor.locator("pre .code-block-content")).toContainText("line1");
  await expect(editor.locator("pre .code-block-content")).toContainText("line2");

  const escaped = await page.evaluate(() => {
    const root = document.querySelector(".ProseMirror");
    if (!root) return false;
    return Array.from(root.children).some(
      (el) => el.tagName === "P" && (el.textContent ?? "").includes("line2"),
    );
  });
  expect(escaped).toBe(false);
});

test("Enter mid-paragraph splits the block (regression: createParagraphNear was jumping the cursor)", async ({ page }) => {
  await page.goto("/__editor-e2e");
  const editor = await focusEditor(page);

  await page.keyboard.type("hello world");
  // Place the caret programmatically — headless Chromium's ArrowLeft is
  // unreliable inside contenteditable with trailing breaks. Doc position 6
  // sits between "hello" and " world" (position 1 is the start of the paragraph).
  await page.evaluate(() => {
    const ed = (window as any).__nw_editor;
    ed.commands.focus();
    ed.commands.setTextSelection(6);
  });
  await page.keyboard.press("Enter");

  await expect(editor.locator("p")).toHaveCount(2);
  await expect(editor.locator("p").nth(0)).toHaveText("hello");
  await expect(editor.locator("p").nth(1)).toHaveText(" world");
});

test("Backspace at start of a heading collapses it to a paragraph", async ({ page }) => {
  await page.goto("/__editor-e2e");
  const editor = await focusEditor(page);

  await page.keyboard.type("# Title");
  await expect(editor.locator("h1")).toContainText("Title");
  // Home is unreliable in headless Chromium contenteditable (same as ArrowLeft).
  await page.evaluate(() => {
    const ed = (window as any).__nw_editor;
    const start = ed.state.selection.$from.start();
    ed.commands.focus();
    ed.commands.setTextSelection(start);
  });
  await page.keyboard.press("Backspace");
  await expect(editor.locator("h1")).toHaveCount(0);
  await expect(editor.locator("p").first()).toContainText("Title");
});

test("a trailing paragraph sits below a code fence so you can type after it", async ({ page }) => {
  await page.goto("/__editor-e2e");
  const editor = await focusEditor(page);

  await page.keyboard.type("```ts");
  await page.keyboard.press("Enter");
  await expect(editor.locator("pre .code-block-content")).toBeVisible();
  await page.keyboard.type("const x = 1;");

  const lastType = await page.evaluate(() => {
    const ed = (window as unknown as { __nw_editor: { state: { doc: { lastChild: { type: { name: string } } | null } } } }).__nw_editor;
    return ed.state.doc.lastChild?.type.name ?? "";
  });
  expect(lastType).toBe("paragraph");

  await page.evaluate(() => {
    const ed = (window as any).__nw_editor;
    ed.commands.focus("end");
  });
  await page.keyboard.type("hello");

  await expect(editor.locator("p").filter({ hasText: "hello" })).toHaveCount(1);
  await expect(editor.locator("pre .code-block-content")).toContainText("const x = 1;");
  await expectParity(page);
});