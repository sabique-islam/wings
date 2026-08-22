import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

const CHATGPT_PASTE = `If you mean an integration-by-parts equation:

[
\\boxed{\\int u,dv = uv-\\int v,du}
]

Example:

[
\\int x e^x,dx = xe^x-\\int e^x,dx = e^x(x-1)+C
]
`;

test("pasting a ChatGPT equation dump renders KaTeX blocks", async ({ page }) => {
  await page.goto("/__editor-e2e");
  const editor = await focusEditor(page);

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(async (pasteText) => {
    await navigator.clipboard.writeText(pasteText);
  }, CHATGPT_PASTE);
  await page.keyboard.press("Meta+v");

  await expect(editor.locator(".math-block")).toHaveCount(2);
  await expect(editor.locator(".math-block .katex").first()).toBeVisible();

  const stored = await page.evaluate(() => (window as any).__nw_getMarkdown?.() ?? "");
  expect(stored).toContain("$$");
  expect(stored).toContain("\\boxed");
});

test("typing $x^2$ renders inline KaTeX", async ({ page }) => {
  await page.goto("/__editor-e2e");
  const editor = await focusEditor(page);

  // Avoid `{` / `}` in typed text — Playwright treats those as key shortcuts.
  await page.keyboard.type("$x^2$");

  await expect(editor.locator(".math-inline")).toHaveCount(1);
  await expect(editor.locator(".math-inline .katex")).toBeVisible();
});
