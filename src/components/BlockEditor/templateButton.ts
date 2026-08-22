import type { Editor, JSONContent } from "@tiptap/core";
import {
  currentPlannerWeek,
  nextPlannerWeek,
  parseTemplateButtonContent,
  parseWeekHeading,
  parseWeekRangeLabel,
  stripBlockIds,
  weeklyPlannerPageContent,
  weeklyPlannerWeekContent,
} from "@/lib/weeklyPlanner";
import { patchEditorAppearance } from "@/lib/editorAppearance";

export const SUGGEST_PAGE_TITLE_EVENT = "nw:suggestPageTitle";

export function suggestPageTitle(title: string): void {
  if (typeof window === "undefined" || !title.trim()) return;
  window.dispatchEvent(new CustomEvent(SUGGEST_PAGE_TITLE_EVENT, { detail: { title } }));
}

function collectPlannerState(editor: Editor): { weekNumbers: number[]; lastSunday: Date | null } {
  const weekNumbers: number[] = [];
  let lastSunday: Date | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "heading") {
      const n = parseWeekHeading(node.textContent);
      if (n != null) weekNumbers.push(n);
      return;
    }
    if (node.type.name === "paragraph") {
      const parsed = parseWeekRangeLabel(node.textContent);
      if (parsed) lastSunday = parsed;
    }
  });
  return { weekNumbers, lastSunday };
}

/** Insert before the trailing empty paragraph so weeks stack above the caret. */
export function insertBlocksBeforeTrailing(editor: Editor, content: JSONContent[]): boolean {
  if (!content.length) return false;
  const { doc } = editor.state;
  let insertPos = doc.content.size;
  const last = doc.lastChild;
  if (last?.type.name === "paragraph" && last.content.size === 0) {
    insertPos = doc.content.size - last.nodeSize;
  }
  return editor.chain().focus().insertContentAt(insertPos, content).run();
}

export function insertNextWeeklyPlannerWeek(editor: Editor, now = new Date()): boolean {
  const { weekNumbers, lastSunday } = collectPlannerState(editor);
  const week = nextPlannerWeek(weekNumbers, lastSunday, now);
  return insertBlocksBeforeTrailing(editor, weeklyPlannerWeekContent(week));
}

export function stampTemplateButton(editor: Editor, buttonPos: number, now = new Date()): boolean {
  const node = editor.state.doc.nodeAt(buttonPos);
  if (!node || node.type.name !== "templateButton") return false;
  const kind = String(node.attrs.kind || "blocks");
  if (kind === "weekly-planner") {
    return insertNextWeeklyPlannerWeek(editor, now);
  }
  const blocks = parseTemplateButtonContent(node.attrs.contentJson).map(stripBlockIds);
  return insertBlocksBeforeTrailing(editor, blocks);
}

export function insertWeeklyPlanner(editor: Editor, now = new Date()): boolean {
  patchEditorAppearance({ fullWidth: true });
  suggestPageTitle(currentPlannerWeek(now).title);
  return editor.chain().focus().insertContent(weeklyPlannerPageContent(now)).run();
}
