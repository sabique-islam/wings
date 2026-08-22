import { expect, test, type Page } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

async function setEditorHtml(page: Page, html: string) {
  await page.evaluate((next) => {
    const ed = (window as unknown as { __nw_editor: { commands: { setContent: (html: string) => void } } }).__nw_editor;
    ed.commands.setContent(next);
  }, html);
}

test.describe("Heading fold", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("folding an h2 hides following paragraphs, not the next h2", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await setEditorHtml(
      page,
      "<h2>Alpha</h2><p>one</p><h3>Nested</h3><p>two</p><h2>Beta</h2><p>three</p>",
    );

    await page.locator(".ProseMirror h2").filter({ hasText: "Alpha" }).locator(".nw-heading-fold").click();

    await expect(editor.getByText("one")).toBeHidden();
    await expect(editor.getByText("Nested")).toBeHidden();
    await expect(editor.getByText("two")).toBeHidden();
    await expect(editor.getByText("Beta")).toBeVisible();
    await expect(editor.getByText("three")).toBeVisible();

    const json = await page.evaluate(() =>
      JSON.stringify((window as unknown as { __nw_editor: { getJSON: () => unknown } }).__nw_editor.getJSON()),
    );
    expect(json).toContain("one");
    expect(json).toContain("Nested");
  });

  test("unfold restores the hidden blocks", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await setEditorHtml(page, "<h2>Alpha</h2><p>secret body</p><h2>Beta</h2>");

    const fold = page.locator(".ProseMirror h2").filter({ hasText: "Alpha" }).locator(".nw-heading-fold");
    await fold.click();
    await expect(editor.getByText("secret body")).toBeHidden();

    await fold.click();
    await expect(editor.getByText("secret body")).toBeVisible();
  });

  test("reload from markdown keeps the heading collapsed", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await setEditorHtml(page, "<h2>Alpha</h2><p>secret body</p><h2>Beta</h2>");
    await page.locator(".ProseMirror h2").filter({ hasText: "Alpha" }).locator(".nw-heading-fold").click();
    await expect(editor.getByText("secret body")).toBeHidden();

    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId("stored-text")).toContainText("data-collapsed");

    await page.getByTestId("reload-from-markdown").click();
    await expect(page.locator(".ProseMirror")).toBeVisible();
    await expect(page.locator(".ProseMirror h2").filter({ hasText: "Alpha" })).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    await expect(page.locator(".ProseMirror").getByText("secret body")).toBeHidden();
    await expect(page.locator(".ProseMirror").getByText("Beta")).toBeVisible();
  });

  test("Enter at the end of a folded h1 inserts a paragraph after the range, not another heading", async ({ page }) => {
    await setEditorHtml(page, "<h1>Title</h1><p>secret</p><h1>Other</h1>");
    await page.evaluate(() => {
      const ed = (
        window as unknown as {
          __nw_editor: {
            state: { doc: { descendants: (fn: (node: { type: { name: string }; textContent: string }, pos: number) => void) => void } };
            commands: { setTextSelection: (pos: number) => void; updateAttributes: (type: string, attrs: object) => boolean };
          };
        }
      ).__nw_editor;
      let pos = -1;
      ed.state.doc.descendants((node, nodePos) => {
        if (node.type.name === "heading" && node.textContent === "Title") {
          pos = nodePos;
          return false;
        }
      });
      ed.commands.setTextSelection(pos + 1);
      ed.commands.updateAttributes("heading", { collapsed: true });
      ed.commands.setTextSelection(pos + 1 + "Title".length);
    });

    await page.keyboard.press("Enter");

    const snapshot = await page.evaluate(() => {
      const ed = (
        window as unknown as {
          __nw_editor: {
            state: {
              doc: {
                childCount: number;
                child: (i: number) => { type: { name: string }; textContent: string };
              };
            };
          };
        }
      ).__nw_editor;
      const nodes: string[] = [];
      for (let i = 0; i < ed.state.doc.childCount; i++) {
        const child = ed.state.doc.child(i);
        nodes.push(`${child.type.name}:${child.textContent}`);
      }
      return nodes;
    });

    expect(snapshot.filter((n) => n.startsWith("heading:Title"))).toHaveLength(1);
    expect(snapshot.filter((n) => n.startsWith("heading:"))).toHaveLength(2);
    const titleAt = snapshot.findIndex((n) => n === "heading:Title");
    const otherAt = snapshot.findIndex((n) => n === "heading:Other");
    const inserted = snapshot.slice(titleAt + 1, otherAt);
    expect(inserted.some((n) => n.startsWith("paragraph:") && !n.includes("secret"))).toBe(true);
    await expect(page.locator(".ProseMirror").getByText("secret")).toBeHidden();
  });
});
