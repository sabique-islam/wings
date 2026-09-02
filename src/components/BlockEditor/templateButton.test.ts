import { describe, expect, it, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import { insertWeeklyPlanner, stampTemplateButton, wrapUnwrappedPlannerWeeks } from "./templateButton";
import { parseWeekHeading } from "@/lib/weeklyPlanner";
import { clearEditorAppearance } from "@/lib/editorAppearance";
import { htmlToMarkdown } from "@/lib/markdown";
import { shouldBlockEmptySave } from "@/lib/editorContent";

function makeEditor(content = "<p></p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

function weekHeadings(editor: Editor): number[] {
  const out: number[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "heading") return;
    const n = parseWeekHeading(node.textContent);
    if (n != null) out.push(n);
  });
  return out;
}

function buttonPos(editor: Editor): number {
  let pos = -1;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === "templateButton") {
      pos = nodePos;
      return false;
    }
  });
  if (pos < 0) throw new Error("template button not found");
  return pos;
}

function columnCounts(editor: Editor): number[] {
  const counts: number[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "columnList") counts.push(node.childCount);
  });
  return counts;
}

afterEach(() => {
  clearEditorAppearance();
});

describe("weekly planner insert", () => {
  it("registers templateButton and 5-column lists", () => {
    const editor = makeEditor();
    expect(editor.schema.nodes.templateButton).toBeTruthy();
    expect(editor.schema.nodes.heading.spec.attrs?.bgColor).toBeTruthy();
    editor.commands.insertColumnList(5);
    expect(columnCounts(editor)).toEqual([5]);
    editor.destroy();
  });

  it("inserts a New week button and a 5+5 day grid", () => {
    const editor = makeEditor("<p></p>");
    const now = new Date(2026, 7, 23, 12);
    expect(insertWeeklyPlanner(editor, now)).toBe(true);
    const weeks = weekHeadings(editor);
    expect(weeks).toHaveLength(1);
    expect(editor.state.doc.textContent).toContain(`Week ${weeks[0]}`);
    expect(columnCounts(editor)).toEqual([5, 5]);
    expect(editor.getHTML()).toContain("template-button");
    expect(editor.getHTML()).toContain("week-card");
    expect(editor.getHTML()).toContain("Sunday");
    expect(editor.getHTML()).toContain("Groceries");
    const markdown = htmlToMarkdown(editor.getHTML());
    expect(markdown.length).toBeGreaterThan(20);
    expect(shouldBlockEmptySave("existing content here!!!!", markdown)).toBe(false);
    editor.destroy();
  });

  it("stamps the next week above the first", () => {
    const editor = makeEditor("<p></p>");
    const now = new Date(2026, 7, 23, 12);
    insertWeeklyPlanner(editor, now);
    expect(stampTemplateButton(editor, buttonPos(editor), now)).toBe(true);
    const weeks = weekHeadings(editor);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toBe(weeks[1]! + 1);
    expect(columnCounts(editor)).toEqual([5, 5, 5, 5]);
    expect(editor.view.dom.querySelectorAll("[data-type='week-card']")).toHaveLength(2);
    const cards = editor.view.dom.querySelectorAll("[data-type='week-card']");
    expect(cards[0]?.textContent).toContain(`Week ${weeks[0]}`);
    expect(cards[1]?.textContent).toContain(`Week ${weeks[1]}`);
    editor.destroy();
  });

  it("wraps a legacy flat week without dropping text", () => {
    const editor = makeEditor(
      "<h2>Week 1</h2><p>Aug 23 – Aug 29, 2026</p><div data-type=\"column-list\" data-cols=\"2\"><div data-type=\"column\"><h3>Sunday</h3><p>sun</p></div><div data-type=\"column\"><h3>Monday</h3><p>mon</p></div></div>",
    );
    const before = editor.state.doc.textContent;
    expect(wrapUnwrappedPlannerWeeks(editor)).toBe(true);
    expect(editor.state.doc.textContent).toBe(before);
    expect(editor.state.doc.firstChild?.type.name).toBe("weekCard");
    expect(wrapUnwrappedPlannerWeeks(editor)).toBe(false);
    editor.destroy();
  });
});
