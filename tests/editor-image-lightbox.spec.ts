import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

const KEEP = "lightbox-keep-4c1";
const SRC = "https://example.com/wings-lightbox.png";

test.describe("Image lightbox", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(SRC, async (route) => {
      await route.fulfill({
        path: "tests/fixtures/pixel.png",
        contentType: "image/png",
      });
    });
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("clicking an image opens a preview; Esc closes without rewriting the page", async ({ page }) => {
    await page.keyboard.type(KEEP);
    await page.keyboard.press("Enter");
    await page.evaluate((src) => {
      const editor = (
        window as unknown as {
          __nw_editor?: {
            chain: () => {
              focus: () => {
                setImage: (attrs: { src: string }) => {
                  updateAttributes: (name: string, attrs: { width: string }) => { run: () => boolean };
                };
              };
            };
          };
        }
      ).__nw_editor;
      editor?.chain().focus().setImage({ src }).updateAttributes("image", { width: "240px" }).run();
    }, SRC);

    const img = page.getByTestId("editor-image");
    await expect(img).toBeVisible();
    await expect(page.getByTestId("stored-text")).toContainText(KEEP);
    await expect(page.getByTestId("stored-text")).toContainText(SRC);

    await img.click({ position: { x: 40, y: 20 } });
    const modal = page.getByTestId("image-lightbox");
    await expect(modal).toBeVisible();
    await expect(page.getByTestId("image-lightbox-image")).toHaveAttribute("src", SRC);
    await expect(page.getByTestId("image-lightbox-download")).toBeVisible();
    await expect(page.locator(".editor-image-caption")).toHaveCount(1);
    await expect(page.locator(".editor-image-resize")).toHaveCount(1);

    await expect(page.getByTestId("stored-text")).toContainText(KEEP);
    await expect(page.getByTestId("stored-text")).toContainText(SRC);

    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId("stored-text")).toContainText(KEEP);
    await expect(page.getByTestId("stored-text")).toContainText(SRC);
  });

  test("javascript src does not open a lightbox; slash still inserts a callout", async ({ page }) => {
    await page.keyboard.type(KEEP);
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("nw:image-lightbox", { detail: { src: "javascript:alert(1)", caption: "x" } }),
      );
    });
    await expect(page.getByTestId("image-lightbox")).toHaveCount(0);

    await page.keyboard.press("Enter");
    await page.keyboard.type("/callout");
    const calloutItem = page.locator(".slash-menu button", { hasText: "Callout" });
    await expect(calloutItem).toBeVisible();
    await calloutItem.click();
    await expect(page.locator('[data-type="callout"]')).toHaveCount(1);
    await expect(page.getByTestId("stored-text")).toContainText(KEEP);
  });
});
