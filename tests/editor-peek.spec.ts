import { expect, test, type Page } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

async function insertReadingChip(page: Page) {
  await page.keyboard.type("keep-this-page [[Reading");
  await page.getByRole("button", { name: "Reading List" }).click();
  const chip = page.locator('.block-editor-wrapper:not([data-peek="true"]) a[data-type="page-ref"]');
  await expect(chip).toHaveCount(1);
  return chip;
}

async function liveFlush(page: Page) {
  return page.evaluate(() => {
    const flush = (
      window as unknown as {
        __nw_flushEditor?: (id?: string) => { markdown?: string } | null;
        __nw_getMarkdown?: () => string;
      }
    ).__nw_flushEditor;
    const getMarkdown = (window as unknown as { __nw_getMarkdown?: () => string }).__nw_getMarkdown;
    return {
      live: flush?.("e2e-harness")?.markdown ?? null,
      peekSlot: flush?.("peek:page-reading-list") ?? null,
      ai: getMarkdown?.() ?? null,
    };
  });
}

test.describe("Page peek", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("hovering a page chip shows a preview and Peek opens one read-only modal", async ({ page }) => {
    const chip = await insertReadingChip(page);
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId("stored-text")).toContainText("keep-this-page");
    await expect(page.getByTestId("stored-text")).toContainText("[Reading List](#page:page-reading-list)");

    await chip.hover();
    const preview = page.getByTestId("page-ref-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Reading List");
    await expect(preview).toContainText("Books to get through this year.");

    await page.getByTestId("page-ref-peek").click();
    const modal = page.getByTestId("page-peek-modal");
    await expect(modal).toHaveCount(1);
    await expect(modal).toBeVisible();
    await expect(page.locator(".page-peek-title")).toHaveText("Reading List");
    await expect(modal.locator(".ProseMirror")).toContainText("Books to get through this year.");
    await expect(page.locator('[data-peek="true"] .ProseMirror')).toHaveCount(1);

    await expect(page.getByTestId("stored-text")).toContainText("keep-this-page");
    await expect(page.getByTestId("stored-text")).not.toContainText("Books to get through this year.");

    const flushed = await liveFlush(page);
    expect(flushed.live).toContain("keep-this-page");
    expect(flushed.peekSlot).toBeNull();
    expect(flushed.ai).toContain("keep-this-page");
    expect(flushed.ai).not.toContain("Books to get through this year.");

    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId("stored-text")).toContainText("keep-this-page");
    await expect(page.getByTestId("stored-text")).toContainText("[Reading List](#page:page-reading-list)");
  });

  test("shift-click peeks without replacing the live page", async ({ page }) => {
    await insertReadingChip(page);
    await page.evaluate(() => {
      const chip = document.querySelector(
        '.block-editor-wrapper:not([data-peek="true"]) a[data-type="page-ref"]',
      );
      if (!chip) throw new Error("page chip missing");
      chip.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          composed: true,
          shiftKey: true,
        }),
      );
    });
    const modal = page.getByTestId("page-peek-modal");
    await expect(modal).toHaveCount(1);
    await expect(modal.locator(".ProseMirror")).toContainText("Books to get through this year.");
    await expect(page.locator('.block-editor-wrapper:not([data-peek="true"]) .ProseMirror')).toContainText(
      "keep-this-page",
    );
  });

  test("⌘-click on a page chip does not peek", async ({ page }) => {
    await insertReadingChip(page);
    await page.evaluate(() => {
      const chip = document.querySelector(
        '.block-editor-wrapper:not([data-peek="true"]) a[data-type="page-ref"]',
      );
      if (!chip) throw new Error("page chip missing");
      chip.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          composed: true,
          metaKey: true,
          ctrlKey: true,
        }),
      );
    });
    await expect(page.getByTestId("page-peek-modal")).toHaveCount(0);
    await expect(page.locator('.block-editor-wrapper:not([data-peek="true"]) .ProseMirror')).toContainText(
      "keep-this-page",
    );
  });

  test("a second peek replaces the first instead of stacking", async ({ page }) => {
    await insertReadingChip(page);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("nw:peek", { detail: "page-reading-list" }));
    });
    await expect(page.getByTestId("page-peek-modal")).toHaveCount(1);
    await expect(page.locator(".page-peek-title")).toHaveText("Reading List");

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("nw:peek", { detail: "page-release-notes" }));
    });
    await expect(page.getByTestId("page-peek-modal")).toHaveCount(1);
    await expect(page.locator(".page-peek-title")).toHaveText("Release Notes");
    await expect(page.getByTestId("page-peek-modal").locator(".ProseMirror")).toContainText(
      "What shipped and when.",
    );
  });

  test("clicking the peek title records navigation and closes", async ({ page }) => {
    await insertReadingChip(page);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("nw:peek", { detail: "page-reading-list" }));
    });
    await expect(page.getByTestId("page-peek-modal")).toBeVisible();
    await page.locator(".page-peek-title").click();
    await expect(page.getByTestId("page-peek-modal")).toHaveCount(0);
    await expect(page.getByTestId("peek-navigated")).toHaveText("page-reading-list");
  });

  test("slash menu Enter still inserts a callout after peek", async ({ page }) => {
    await insertReadingChip(page);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("nw:peek", { detail: "page-reading-list" }));
    });
    await expect(page.getByTestId("page-peek-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("page-peek-modal")).toHaveCount(0);

    const editor = page.locator('.block-editor-wrapper:not([data-peek="true"]) .ProseMirror');
    await editor.click();
    await page.keyboard.type("/callout");
    await expect(page.locator(".slash-menu button", { hasText: "Callout" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(editor.locator('[data-type="callout"]')).toHaveCount(1);
  });
});
