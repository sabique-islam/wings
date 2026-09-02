import { describe, expect, it } from "vitest";
import {
  currentPlannerWeek,
  formatWeekRange,
  nextPlannerWeek,
  parseWeekHeading,
  parseWeekRangeLabel,
  plannerWeekFromSunday,
  stripBlockIds,
  sundayOf,
  weekNumberStartingSunday,
  weeklyPlannerPageContent,
  latestPlannerSunday,
  plannerDayName,
  weekContainsDate,
  weeklyPlannerWeekContent,
  normalizeWeeklyPlannerDoc,
} from "./weeklyPlanner";

describe("weekly planner dates", () => {
  it("pins the week to Sunday–Saturday", () => {
    const wednesday = new Date(2026, 7, 26, 15, 0, 0); // Aug 26 2026 is Wednesday
    const sunday = sundayOf(wednesday);
    expect(sunday.getDay()).toBe(0);
    expect(sunday.getDate()).toBe(23);
    expect(sunday.getMonth()).toBe(7);
  });

  it("numbers weeks from the Sunday that contains Jan 1", () => {
    expect(weekNumberStartingSunday(new Date(2026, 0, 1))).toBe(1);
    const week = currentPlannerWeek(new Date(2026, 7, 23, 12, 0, 0));
    expect(week.title).toBe(`Week ${week.weekNumber}`);
    expect(week.rangeLabel).toMatch(/Aug 23/);
    expect(week.rangeLabel).toMatch(/2026/);
  });

  it("formats a range without a duplicate year", () => {
    const sunday = sundayOf(new Date(2026, 7, 23));
    expect(formatWeekRange(sunday)).toBe("Aug 23 – Aug 29, 2026");
  });

  it("parses a Week heading and a range label", () => {
    expect(parseWeekHeading("Week 34")).toBe(34);
    expect(parseWeekHeading("week 1")).toBe(1);
    expect(parseWeekHeading("Goals this week")).toBeNull();
    const sunday = parseWeekRangeLabel("Aug 23 – Aug 29, 2026");
    expect(sunday?.getDate()).toBe(23);
    expect(sunday?.getMonth()).toBe(7);
  });

  it("extends to the next unused week number", () => {
    const last = sundayOf(new Date(2026, 7, 23));
    const next = nextPlannerWeek([34], last, new Date(2026, 7, 23, 12));
    expect(next.weekNumber).toBe(35);
    expect(next.sunday.getDate()).toBe(30);
    expect(next.title).toBe("Week 35");
  });

  it("starts at the current week when the page has none yet", () => {
    const now = new Date(2026, 7, 26, 12);
    const next = nextPlannerWeek([], null, now);
    expect(next.weekNumber).toBe(currentPlannerWeek(now).weekNumber);
    expect(next.sunday.getTime()).toBe(sundayOf(now).getTime());
  });

  it("picks the latest Sunday regardless of document order", () => {
    const older = sundayOf(new Date(2026, 7, 23));
    const newer = sundayOf(new Date(2026, 7, 30));
    expect(latestPlannerSunday([newer, older])?.getTime()).toBe(newer.getTime());
    expect(weekContainsDate(older, new Date(2026, 7, 26, 12))).toBe(true);
    expect(weekContainsDate(older, new Date(2026, 7, 30, 12))).toBe(false);
    expect(plannerDayName(new Date(2026, 7, 26, 12))).toBe("Wednesday");
  });
});

describe("weekly planner JSON", () => {
  it("builds a button plus a 5+5 column week card", () => {
    const page = weeklyPlannerPageContent(new Date(2026, 7, 23, 12));
    expect(page[0]?.type).toBe("templateButton");
    expect(page[0]?.attrs?.kind).toBe("weekly-planner");
    expect(page[1]?.type).toBe("weekCard");
    const week = plannerWeekFromSunday(sundayOf(new Date(2026, 7, 23)), 1);
    const blocks = weeklyPlannerWeekContent(week);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("weekCard");
    const inner = blocks[0]?.content ?? [];
    const lists = inner.filter((n) => n.type === "columnList");
    expect(lists).toHaveLength(2);
    expect(lists[0]?.content).toHaveLength(5);
    expect(lists[1]?.content).toHaveLength(5);
    expect(JSON.stringify(blocks)).toContain("Sunday");
    expect(JSON.stringify(blocks)).toContain("Groceries");
    expect(JSON.stringify(blocks)).toContain("Goals this week");
  });

  it("strips UniqueID attrs before a button stamp", () => {
    const stripped = stripBlockIds({
      type: "heading",
      attrs: { id: "abc", level: 2 },
      content: [{ type: "text", text: "Week 1" }],
    });
    expect(stripped.attrs).toEqual({ level: 2 });
  });
});

function jsonText(node: { text?: string; content?: unknown[] }): string {
  if (typeof node.text === "string") return node.text;
  return ((node.content ?? []) as typeof node[]).map(jsonText).join("");
}

describe("normalizeWeeklyPlannerDoc", () => {
  it("wraps a flat Week heading sequence without dropping text", () => {
    const flat = {
      type: "doc" as const,
      content: [
        { type: "templateButton", attrs: { kind: "weekly-planner", label: "New week", contentJson: "[]" } },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Week 34" }] },
        { type: "paragraph", content: [{ type: "text", text: "Aug 23 – Aug 29, 2026" }] },
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Goals this week" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Week 35" }] },
        { type: "paragraph", content: [{ type: "text", text: "Aug 30 – Sep 5, 2026" }] },
        { type: "paragraph" },
      ],
    };
    const before = jsonText(flat);
    const next = normalizeWeeklyPlannerDoc(flat);
    expect(jsonText(next).length).toBe(before.length);
    expect(jsonText(next)).toContain("Week 34");
    expect(jsonText(next)).toContain("Week 35");
    expect(jsonText(next)).toContain("Goals this week");
    expect(next.content?.filter((n) => n.type === "weekCard")).toHaveLength(2);
    expect(next.content?.[0]?.type).toBe("templateButton");
    expect(jsonText(next.content?.[1] ?? {})).toContain("Week 35");
    expect(jsonText(next.content?.[2] ?? {})).toContain("Week 34");
    expect(next.content?.[next.content.length - 1]?.type).toBe("paragraph");
  });

  it("is a no-op when weeks are already cards", () => {
    const page = weeklyPlannerPageContent(new Date(2026, 7, 23, 12));
    const doc = { type: "doc" as const, content: page };
    expect(normalizeWeeklyPlannerDoc(doc)).toEqual(doc);
  });

  it("leaves a plain Week heading note alone when there is no planner grid", () => {
    const doc = {
      type: "doc" as const,
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Week 5" }] },
        { type: "paragraph", content: [{ type: "text", text: "just a heading" }] },
      ],
    };
    expect(normalizeWeeklyPlannerDoc(doc)).toEqual(doc);
  });

  it("reorders already-wrapped weeks newest first without dropping text", () => {
    const older = weeklyPlannerWeekContent(
      plannerWeekFromSunday(sundayOf(new Date(2026, 7, 23)), 34),
    )[0]!;
    const newer = weeklyPlannerWeekContent(
      plannerWeekFromSunday(sundayOf(new Date(2026, 7, 30)), 35),
    )[0]!;
    const doc = {
      type: "doc" as const,
      content: [
        { type: "templateButton", attrs: { kind: "weekly-planner", label: "New week", contentJson: "[]" } },
        older,
        newer,
      ],
    };
    const before = jsonText(doc);
    const next = normalizeWeeklyPlannerDoc(doc);
    expect(jsonText(next).length).toBe(before.length);
    expect(jsonText(next.content?.[1] ?? {})).toContain("Week 35");
    expect(jsonText(next.content?.[2] ?? {})).toContain("Week 34");
  });
});
