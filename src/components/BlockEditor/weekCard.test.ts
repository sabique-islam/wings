import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import { insertWeeklyPlanner, stampTemplateButton } from "./templateButton";
import { findColumnDepth, findWeekCardDepth, selectionCoveringNode } from "./blockUtils";
import { nestCurrentBlock } from "./outlineNest";

function makeEditor(content = "<p></p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
}

function placeCursorInHeading(editor: Editor, text: string) {
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === "heading" && node.textContent === text) {
      pos = nodePos + 1;
      return false;
    }
  });
  if (pos == null) throw new Error(`heading "${text}" not found`);
  editor.commands.setTextSelection(pos);
}

function weekCardCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "weekCard") count += 1;
  });
  return count;
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

describe("weekCard isolation", () => {
  it("registers an isolating weekCard", () => {
    const editor = makeEditor();
    expect(editor.schema.nodes.weekCard).toBeTruthy();
    expect(editor.schema.nodes.weekCard.spec.isolating).toBe(true);
    editor.destroy();
  });

  it("selects the week on the second Mod-a, not the other week", () => {
    const editor = makeEditor();
    const now = new Date(2026, 7, 23, 12);
    insertWeeklyPlanner(editor, now);
    stampTemplateButton(editor, buttonPos(editor), now);
    expect(weekCardCount(editor)).toBe(2);

    const cards: { pos: number; text: string }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "weekCard") cards.push({ pos, text: node.textContent });
    });
    expect(cards).toHaveLength(2);

    let sundayPos: number | null = null;
    editor.state.doc.nodesBetween(cards[0]!.pos, cards[0]!.pos + editor.state.doc.nodeAt(cards[0]!.pos)!.nodeSize, (node, pos) => {
      if (node.type.name === "heading" && node.textContent === "Sunday") {
        sundayPos = pos + 1;
        return false;
      }
    });
    editor.commands.setTextSelection(sundayPos!);

    const $from = editor.state.selection.$from;
    const columnDepth = findColumnDepth($from as never);
    const weekDepth = findWeekCardDepth($from as never);
    expect(columnDepth).not.toBeNull();
    expect(weekDepth).not.toBeNull();

    const colSel = selectionCoveringNode(
      editor.state.doc,
      $from.before(columnDepth!),
      $from.node(columnDepth!),
    );
    expect(editor.state.doc.textBetween(colSel.from, colSel.to)).not.toContain("Monday");

    const weekSel = selectionCoveringNode(
      editor.state.doc,
      $from.before(weekDepth!),
      $from.node(weekDepth!),
    );
    const weekText = editor.state.doc.textBetween(weekSel.from, weekSel.to);
    expect(weekText).toContain("Sunday");
    expect(weekText).toContain("Aug 30");
    expect(weekText).not.toContain("Aug 23");
    editor.destroy();
  });

  it("does not Tab the next week into the previous week's reflection", () => {
    const editor = makeEditor();
    const now = new Date(2026, 7, 23, 12);
    insertWeeklyPlanner(editor, now);
    stampTemplateButton(editor, buttonPos(editor), now);
    const weeks: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "heading" && /^Week\s+\d+\s*$/i.test(node.textContent)) {
        weeks.push(node.textContent);
      }
    });
    placeCursorInHeading(editor, weeks[1]!);
    expect(nestCurrentBlock(editor)).toBe(false);
    expect(weekCardCount(editor)).toBe(2);
    editor.destroy();
  });
});
