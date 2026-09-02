import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createBlockEditorExtensions } from "./editorExtensions";
import { insertWeeklyPlanner, stampTemplateButton } from "./templateButton";
import { plannerTodayDecorations } from "./plannerToday";
import { plannerDayName } from "@/lib/weeklyPlanner";

function makeEditor(content = "<p></p>") {
  return new Editor({
    extensions: createBlockEditorExtensions(),
    content,
  });
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

describe("planner today highlight", () => {
  it("decorates today's day heading in the current week only", () => {
    const editor = makeEditor();
    const wednesday = new Date(2026, 7, 26, 12);
    insertWeeklyPlanner(editor, wednesday);
    const decos = plannerTodayDecorations(editor.state.doc as never, wednesday);
    expect(decos.find()).toHaveLength(1);
    const hit = decos.find()[0]!;
    const node = editor.state.doc.nodeAt(hit.from);
    expect(node?.type.name).toBe("heading");
    expect(node?.textContent).toBe("Wednesday");

    stampTemplateButton(editor, buttonPos(editor), wednesday);
    const after = plannerTodayDecorations(editor.state.doc as never, wednesday);
    expect(after.find()).toHaveLength(1);
    const still = editor.state.doc.nodeAt(after.find()[0]!.from);
    expect(still?.textContent).toBe("Wednesday");
    editor.destroy();
  });

  it("highlights live today's column when the stamped week is the current one", () => {
    const editor = makeEditor();
    insertWeeklyPlanner(editor);
    expect(editor.view.dom.querySelector(".nw-planner-today")?.textContent).toBe(
      plannerDayName(new Date()),
    );
    editor.destroy();
  });
});
