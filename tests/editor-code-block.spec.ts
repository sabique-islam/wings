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
    await expect(page.locator(".code-mermaid-svg svg, [data-testid='code-mermaid-error']")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("stored-text")).toContainText("```mermaid");
    await expect(page.getByTestId("stored-text")).toContainText("A-->B");
  });
});
