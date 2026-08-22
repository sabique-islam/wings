import { expect, test, type Page } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

test.use({ viewport: { width: 1280, height: 720 } });

async function firstGlyphPoint(locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("block has no bounding box");
  return { x: box.x + 3, y: box.y + Math.max(8, box.height / 2) };
}

async function hitAt(page: Page, x: number, y: number) {
  return page.evaluate(
    ({ left, top }) => {
      const el = document.elementFromPoint(left, top);
      return {
        inHandle: !!el?.closest(".nw-block-handle"),
        tag: el?.nodeName ?? "",
      };
    },
    { left: x, top: y },
  );
}

test("first character of a paragraph stays selectable while the block handle is visible", async ({
  page,
}) => {
  await page.goto("/__editor-e2e");
  const editor = await focusEditor(page);

  await page.keyboard.type("MT-15 : 2.2L INR");
  const para = editor.locator("p").filter({ hasText: "MT-15 : 2.2L INR" }).first();
  await expect(para).toBeVisible();

  const point = await firstGlyphPoint(para);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator(".nw-block-handle.is-visible")).toBeVisible();

  const hit = await hitAt(page, point.x, point.y);
  expect(hit.inHandle).toBe(false);

  await page.mouse.down();
  await page.mouse.move(point.x + 72, point.y);
  await page.mouse.up();

  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected).toMatch(/^M/);
});

test("first character of a list item stays selectable while the block handle is visible", async ({
  page,
}) => {
  await page.goto("/__editor-e2e");
  const editor = await focusEditor(page);

  await page.keyboard.type("- item one");
  const item = editor.locator("ul li").filter({ hasText: "item one" }).first();
  await expect(item).toBeVisible();

  const point = await firstGlyphPoint(item);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator(".nw-block-handle.is-visible")).toBeVisible();

  const hit = await hitAt(page, point.x, point.y);
  expect(hit.inHandle).toBe(false);

  await page.mouse.down();
  await page.mouse.move(point.x + 48, point.y);
  await page.mouse.up();

  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected.length).toBeGreaterThan(0);
});
