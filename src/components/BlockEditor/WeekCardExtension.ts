import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Isolating wrapper for one planner week.
 *
 * Weeks used to be a flat run of headings and column lists in the same
 * document, so caret, Cmd+A, Tab, and sweep could freely cross into the next
 * week. Matching Notion's container model (not AFFiNE nested editors): one
 * ProseMirror doc, one save path, selection cannot span this node.
 */
export const WeekCard = Node.create({
  name: "weekCard",
  group: "block",
  content: "block+",
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="week-card"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "week-card", class: "nw-week-card" }),
      0,
    ];
  },
});
