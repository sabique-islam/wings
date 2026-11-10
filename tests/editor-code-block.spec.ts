import { expect, test, type Page } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

type CodeBlockState = {
  wrap: boolean;
  collapsed: boolean;
  text: string;
};

async function codeBlockState(page: Page): Promise<CodeBlockState | null> {
  return page.evaluate((): CodeBlockState | null => {
    const editor = (
      window as unknown as {
        __nw_editor: {
          state: {
            doc: {
              descendants: (
                fn: (node: {
                  type: { name: string };
                  attrs: { wrap?: boolean; collapsed?: boolean };
                  textContent: string;
                }) => boolean | void,
              ) => void;
            };
          };
        };
      }
    ).__nw_editor;
    let found: CodeBlockState | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "codeBlock") {
        found = {
          wrap: node.attrs.wrap === true,
          collapsed: node.attrs.collapsed === true,
          text: node.textContent,
        };
        return false;
      }
    });
    return found;
  });
}

test.describe("Code blocks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("wrap persists on the node in JSON", async ({ page }) => {
    await page.keyboard.type("```ts ");
    await page.keyboard.type("const a = 1;");
    const wrap = page.getByTestId("code-wrap");
    await expect(wrap).toBeVisible();
    await wrap.click();
    await expect(page.locator(".code-block-wrapper")).toHaveAttribute("data-wrap", "true");
    const state = await codeBlockState(page);
    expect(state?.wrap).toBe(true);
    expect(state?.text).toContain("const a = 1;");
  });

  test("collapse hides extra lines without dropping source", async ({ page }) => {
    await page.keyboard.type("```ts ");
    await page.keyboard.type("line1");
    await page.keyboard.press("Enter");
    await page.keyboard.type("line2");
    await page.keyboard.press("Enter");
    await page.keyboard.type("line3");
    await page.keyboard.press("Enter");
    await page.keyboard.type("line4");
    await page.getByTestId("code-collapse").click();
    await expect(page.locator(".code-block-wrapper")).toHaveAttribute("data-collapsed", "true");
    const state = await codeBlockState(page);
    expect(state?.collapsed).toBe(true);
    expect(state?.text).toContain("line1");
    expect(state?.text).toContain("line4");
  });

  test("language search ranks typescript for ts", async ({ page }) => {
    await page.keyboard.type("``` ");
    await page.getByTestId("code-lang-trigger").click();
    await page.getByTestId("code-lang-search").fill("ts");
    const selected = page.locator("[cmdk-item][data-selected='true']");
    await expect(selected).toHaveAttribute("data-testid", "code-lang-option-typescript");
    await page.getByTestId("code-lang-option-typescript").click();
    await expect(page.locator(".code-block-wrapper")).toHaveAttribute("data-language", "typescript");
  });

  test("a mermaid flowchart still serializes as a fence if preview fails", async ({ page }) => {
    await page.keyboard.type("```mermaid ");
    await expect(page.locator(".code-block-wrapper")).toHaveAttribute("data-language", "mermaid");
    await page.keyboard.type("this is not a diagram");
    await expect(page.getByTestId("code-mermaid-preview")).toBeVisible();
    await expect(page.getByTestId("stored-text")).toContainText("```mermaid");
    await expect(page.getByTestId("stored-text")).toContainText("this is not a diagram");
    const state = await codeBlockState(page);
    expect(state?.text).toBe("this is not a diagram");
  });

  test("a valid mermaid flowchart keeps its source next to the preview", async ({ page }) => {
    await page.keyboard.type("```mermaid ");
    await page.keyboard.type("flowchart TD");
    await page.keyboard.press("Enter");
    await page.keyboard.type("A-->B");
    await expect(page.getByTestId("code-mermaid-preview")).toBeVisible();
    await expect(page.locator(".code-mermaid-svg svg")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator(".code-mermaid-svg svg")).toContainText("A");
    await expect(page.locator(".code-mermaid-svg svg")).toContainText("B");
    await expect(page.getByTestId("stored-text")).toContainText("```mermaid");
    await expect(page.getByTestId("stored-text")).toContainText("A-->B");
  });

  for (const command of ["mermaid", "diagram"]) {
    test(`/${command} inserts a rendered Mermaid diagram in the note`, async ({ page }) => {
      await page.keyboard.type(`/${command}`);
      await page.locator(".slash-menu button").filter({ hasText: "Mermaid Diagram" }).click();
      const block = page.locator('.code-block-wrapper[data-language="mermaid"]');
      await expect(block.locator(".code-mermaid-svg svg")).toBeVisible({ timeout: 15000 });
      await expect(block.locator(".code-mermaid-svg svg")).toContainText("Start");
      await expect(block.locator(".code-block-content")).toContainText("Start --> Finish");
      // Rendered SVG/UI must never become saved note content.
      await expect(page.getByTestId("stored-text")).toContainText("```mermaid");
      await expect(page.getByTestId("stored-text")).not.toContainText("<svg");
      await expect(page.getByTestId("stored-text")).not.toContainText("Mermaid source");
      if (command === "mermaid") await block.screenshot({ path: test.info().outputPath("note-mermaid.png") });
      await page.getByTestId("mermaid-expand").click();
      await expect(page.getByRole("dialog").locator(".code-mermaid-svg svg")).toBeVisible();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await expect(block.locator(".code-block-content")).toContainText("Start --> Finish");
    });
  }

  test("pasted Mermaid renders, updates while editing, and survives reloading the note", async ({ page }) => {
    const markdown = "```mermaid\nflowchart LR\n  Start --> Finish\n```";
    await page.locator(".ProseMirror").evaluate((element, text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
    }, markdown);
    const svg = page.locator(".code-mermaid-svg svg");
    await expect(svg).toContainText("Start", { timeout: 15000 });
    await expect(svg).toContainText("Finish");
    await page.evaluate(() => {
      const editor = (window as typeof window & { __nw_editor: import("@tiptap/core").Editor }).__nw_editor;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== "codeBlock") return;
        editor.chain().focus().setTextSelection(pos + node.nodeSize - 1).run();
        return false;
      });
    });
    await page.keyboard.press("Enter");
    await page.keyboard.type("  Finish --> Done");
    await expect(svg).toContainText("Done");
    await expect(page.getByTestId("stored-text")).toContainText("Finish --> Done");
    const before = await page.getByTestId("stored-text").textContent();
    await page.getByTestId("reload-from-markdown").click();
    await expect(svg).toContainText("Done", { timeout: 15000 });
    await expect(page.locator(".code-block-content")).toContainText("Finish --> Done");
    await expect(page.getByTestId("stored-text")).toHaveText(before!);
  });

  test("shared read-only notes render Mermaid and allow expanding it", async ({ page }) => {
    await page.route("**/rest/v1/rpc/get_shared_entry", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([{ content: "```mermaid\nsequenceDiagram\n Alice->>Bob: Hello\n```", content_json: null, title: "Shared diagram", created_at: "2026-11-10T00:00:00Z" }]),
    }));
    await page.goto("/s/0123456789abcdef0123456789abcdef");
    await expect(page.locator(".ProseMirror")).toHaveAttribute("contenteditable", "false");
    await expect(page.locator(".code-mermaid-svg svg")).toContainText("Hello", { timeout: 15000 });
    await page.getByTestId("mermaid-expand").click();
    await expect(page.getByRole("dialog").locator(".code-mermaid-svg svg")).toContainText("Hello");
  });
});
