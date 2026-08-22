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
  weeklyPlannerWeekContent,
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
});

describe("weekly planner JSON", () => {
  it("builds a button plus a 5+5 column week", () => {
    const page = weeklyPlannerPageContent(new Date(2026, 7, 23, 12));
    expect(page[0]?.type).toBe("templateButton");
    expect(page[0]?.attrs?.kind).toBe("weekly-planner");
    const week = plannerWeekFromSunday(sundayOf(new Date(2026, 7, 23)), 1);
    const blocks = weeklyPlannerWeekContent(week);
    const lists = blocks.filter((n) => n.type === "columnList");
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
