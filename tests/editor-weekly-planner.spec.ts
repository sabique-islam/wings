import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

test.describe("weekly planner", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("slash inserts a week grid that New week extends", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/weekly");
    const item = page.locator(".slash-menu button", { hasText: "Weekly planner" });
    await expect(item).toBeVisible();
    await item.click();

    await expect(page.getByTestId("template-button")).toHaveCount(1);
    await expect(editor.locator('[data-type="week-card"]')).toHaveCount(1);
    await expect(editor.locator("h2", { hasText: /Week \d+/ })).toHaveCount(1);
    await expect(editor.locator('[data-type="column-list"]')).toHaveCount(2);
    await expect(editor.locator('[data-type="column"]')).toHaveCount(10);
    await expect(editor.getByText("Sunday", { exact: true })).toBeVisible();
    await expect(editor.getByText("Groceries", { exact: true })).toBeVisible();

    await page.getByTestId("template-button").click();
    await expect(editor.locator("h2", { hasText: /Week \d+/ })).toHaveCount(2);
    await expect(editor.locator('[data-type="week-card"]')).toHaveCount(2);
    await expect(editor.locator('[data-type="column-list"]')).toHaveCount(4);

    const firstWeek = editor.locator("h2", { hasText: /Week \d+/ }).first();
    await firstWeek.locator(".nw-heading-fold").click();
    await expect(editor.getByText("Sunday", { exact: true }).first()).toBeHidden();
  });

  test("slash inserts five columns", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/5c");
    const item = page.locator(".slash-menu button", { hasText: "Five columns" });
    await expect(item).toBeVisible();
    await item.click();
    await expect(editor.locator('[data-type="column-list"]')).toHaveCount(1);
    await expect(editor.locator('[data-type="column"]')).toHaveCount(5);
  });

  test(":: grips resize columns", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/2col");
    const item = page.locator(".slash-menu button", { hasText: "Two columns" });
    await expect(item).toBeVisible();
    await item.click();

    const list = editor.locator('[data-type="column-list"]').first();
    await list.hover();
    const gap = list.locator(".nw-col-gap").first();
    await expect(gap).toBeVisible();
    const box = await gap.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(list).toHaveAttribute("data-widths", /,/);
  });

  test("Backspace in Sunday does not delete the rest of the week row", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/weekly");
    const item = page.locator(".slash-menu button", { hasText: "Weekly planner" });
    await expect(item).toBeVisible();
    await item.click();
    await expect(editor.getByText("Monday", { exact: true })).toBeVisible();

    await page.evaluate(() => {
      const ed = (
        window as unknown as {
          __nw_editor: {
            state: {
              doc: {
                descendants: (
                  fn: (node: { type: { name: string }; textContent: string; nodeSize: number }, pos: number) => false | void,
                ) => void;
              };
            };
            commands: { setTextSelection: (range: { from: number; to: number }) => void };
          };
        }
      ).__nw_editor;
      let from = -1;
      let to = -1;
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading" && node.textContent === "Sunday") {
          from = pos + 1;
          to = pos + node.nodeSize - 1;
          return false;
        }
      });
      ed.commands.setTextSelection({ from, to });
    });

    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");

    await expect(editor.locator('[data-type="column-list"]').first().locator('[data-type="column"]')).toHaveCount(5);
    await expect(editor.getByText("Monday", { exact: true })).toBeVisible();
    await expect(editor.getByText("Thursday", { exact: true })).toBeVisible();
  });

  test("Cmd+A inside Sunday does not select the rest of the week row", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/weekly");
    const item = page.locator(".slash-menu button", { hasText: "Weekly planner" });
    await expect(item).toBeVisible();
    await item.click();
    await expect(editor.getByText("Monday", { exact: true })).toBeVisible();

    await page.evaluate(() => {
      const ed = (
        window as unknown as {
          __nw_editor: {
            state: {
              doc: {
                descendants: (
                  fn: (node: { type: { name: string }; textContent: string }, pos: number) => false | void,
                ) => void;
              };
            };
            commands: { setTextSelection: (pos: number) => void; focus: () => void };
          };
        }
      ).__nw_editor;
      let pos = -1;
      ed.state.doc.descendants((node, nodePos) => {
        if (node.type.name === "heading" && node.textContent === "Sunday") {
          pos = nodePos + 1;
          return false;
        }
      });
      ed.commands.focus();
      ed.commands.setTextSelection(pos);
    });
    await page.keyboard.press("ControlOrMeta+a");

    const selected = await page.evaluate(() => {
      const ed = (
        window as unknown as {
          __nw_editor: { state: { selection: { from: number; to: number }; doc: { textBetween: (from: number, to: number) => string } } };
        }
      ).__nw_editor;
      return ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to);
    });
    expect(selected).toContain("Sunday");
    expect(selected).not.toContain("Monday");
  });

  test("typing in one week does not edit the other week", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("/weekly");
    const item = page.locator(".slash-menu button", { hasText: "Weekly planner" });
    await expect(item).toBeVisible();
    await item.click();
    await page.getByTestId("template-button").click();
    await expect(editor.locator('[data-type="week-card"]')).toHaveCount(2);

    const inserted = await page.evaluate(() => {
      const ed = (
        window as unknown as {
          __nw_editor: {
            state: {
              doc: {
                descendants: (
                  fn: (node: { type: { name: string }; textContent: string; nodeSize: number }, pos: number) => false | void,
                ) => void;
                nodeAt: (pos: number) => { nodeSize: number } | null;
              };
            };
            commands: { setTextSelection: (pos: number) => void; focus: () => void; insertContent: (value: string) => boolean };
          };
        }
      ).__nw_editor;
      let cardPos = -1;
      ed.state.doc.descendants((node, nodePos) => {
        if (node.type.name === "weekCard" && cardPos < 0) {
          cardPos = nodePos;
        }
      });
      const card = ed.state.doc.nodeAt(cardPos);
      if (!card) return false;
      const cardEnd = cardPos + card.nodeSize;
      let sundayEnd = -1;
      ed.state.doc.descendants((node, nodePos) => {
        if (sundayEnd >= 0) return false;
        if (nodePos < cardPos || nodePos >= cardEnd) return;
        if (node.type.name === "heading" && node.textContent === "Sunday") {
          sundayEnd = nodePos + node.nodeSize - 1;
          return false;
        }
      });
      if (sundayEnd < 0) return false;
      ed.commands.focus();
      ed.commands.setTextSelection(sundayEnd);
      return ed.commands.insertContent(" ONLYWEEKONE");
    });
    expect(inserted).toBe(true);

    const firstCard = editor.locator('[data-type="week-card"]').first();
    const secondCard = editor.locator('[data-type="week-card"]').nth(1);
    await expect(firstCard).toContainText("ONLYWEEKONE");
    await expect(secondCard).not.toContainText("ONLYWEEKONE");

    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+a");
    const selected = await page.evaluate(() => {
      const ed = (
        window as unknown as {
          __nw_editor: {
            state: { selection: { from: number; to: number }; doc: { textBetween: (from: number, to: number) => string } };
          };
        }
      ).__nw_editor;
      return ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to);
    });
    expect(selected).toContain("ONLYWEEKONE");
    await expect(secondCard).not.toContainText("ONLYWEEKONE");
  });
});
