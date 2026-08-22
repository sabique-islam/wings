import type { JSONContent } from "@tiptap/core";

/** Gray bar on day headings — same token as block-menu gray (`BG_COLORS`). */
export const PLANNER_HEADING_BG = "#f1f1ef";

const MS_PER_DAY = 86_400_000;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const WEEK_HEADING_RE = /^Week\s+(\d+)\s*$/i;

export interface PlannerWeek {
  weekNumber: number;
  sunday: Date;
  saturday: Date;
  rangeLabel: string;
  title: string;
}

function atLocalNoon(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function addDays(date: Date, days: number): Date {
  return atLocalNoon(new Date(date.getTime() + days * MS_PER_DAY));
}

/** Sunday 12:00 local of the week that contains `date`. */
export function sundayOf(date: Date): Date {
  const noon = atLocalNoon(date);
  return addDays(noon, -noon.getDay());
}

/**
 * Week number for a Sunday-start calendar. Week 1 contains January 1.
 */
export function weekNumberStartingSunday(date: Date, now = date): number {
  const year = now.getFullYear();
  const start = sundayOf(new Date(year, 0, 1));
  const current = sundayOf(date);
  return Math.round((current.getTime() - start.getTime()) / (7 * MS_PER_DAY)) + 1;
}

export function formatWeekRange(sunday: Date): string {
  const saturday = addDays(sunday, 6);
  const start = sunday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const end = saturday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const year = saturday.getFullYear();
  if (sunday.getFullYear() !== year) {
    return `${start}, ${sunday.getFullYear()} – ${end}, ${year}`;
  }
  return `${start} – ${end}, ${year}`;
}

export function plannerWeekFromSunday(sunday: Date, weekNumber: number): PlannerWeek {
  const start = sundayOf(sunday);
  const saturday = addDays(start, 6);
  return {
    weekNumber,
    sunday: start,
    saturday,
    rangeLabel: formatWeekRange(start),
    title: `Week ${weekNumber}`,
  };
}

export function currentPlannerWeek(now = new Date()): PlannerWeek {
  const sunday = sundayOf(now);
  return plannerWeekFromSunday(sunday, weekNumberStartingSunday(now, now));
}

export function parseWeekHeading(text: string): number | null {
  const match = text.trim().match(WEEK_HEADING_RE);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/** Parse `Aug 23 – Aug 29, 2026` into that week's Sunday. */
export function parseWeekRangeLabel(text: string): Date | null {
  const match = text.trim().match(
    /^([A-Za-z]+)\s+(\d{1,2})(?:\s*,\s*(\d{4}))?\s+[–-]\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/,
  );
  if (!match) return null;
  const startMonth = MONTHS[match[1].toLowerCase()];
  const endYear = Number(match[6]);
  const startYear = match[3] ? Number(match[3]) : endYear;
  const day = Number(match[2]);
  if (startMonth == null || !Number.isFinite(startYear) || !Number.isFinite(day)) return null;
  return sundayOf(new Date(startYear, startMonth, day, 12, 0, 0, 0));
}

export function nextPlannerWeek(
  existingWeekNumbers: number[],
  lastSunday: Date | null,
  now = new Date(),
): PlannerWeek {
  const current = currentPlannerWeek(now);
  const maxExisting = existingWeekNumbers.reduce((max, n) => Math.max(max, n), 0);
  if (!maxExisting) return current;
  const nextNumber = maxExisting + 1;
  const sunday = lastSunday ? addDays(sundayOf(lastSunday), 7) : addDays(current.sunday, 7 * (nextNumber - current.weekNumber));
  return plannerWeekFromSunday(sunday, nextNumber);
}

function text(value: string): JSONContent {
  return { type: "text", text: value };
}

function paragraph(value = ""): JSONContent {
  return value
    ? { type: "paragraph", content: [text(value)] }
    : { type: "paragraph" };
}

function heading(level: 1 | 2 | 3, value: string, bgColor?: string | null): JSONContent {
  return {
    type: "heading",
    attrs: { level, collapsed: false, ...(bgColor ? { bgColor } : {}) },
    content: [text(value)],
  };
}

function taskList(count: number, label = "To-do"): JSONContent {
  return {
    type: "taskList",
    content: Array.from({ length: count }, () => ({
      type: "taskItem",
      attrs: { checked: false },
      content: [paragraph(label)],
    })),
  };
}

function bulletList(items: string[]): JSONContent {
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraph(item)],
    })),
  };
}

function dayColumn(name: string): JSONContent {
  return {
    type: "column",
    content: [heading(3, name, PLANNER_HEADING_BG), taskList(5)],
  };
}

function notesColumn(): JSONContent {
  return {
    type: "column",
    content: [
      heading(3, "Notes", PLANNER_HEADING_BG),
      paragraph("Note Archive"),
      paragraph("New note"),
    ],
  };
}

function groceriesColumn(): JSONContent {
  return {
    type: "column",
    content: [
      heading(3, "Groceries", PLANNER_HEADING_BG),
      bulletList(["almond milk", "pita bread", "oats", "brown sugar", "pasta sauce"]),
    ],
  };
}

function emptyColumn(): JSONContent {
  return { type: "column", content: [paragraph()] };
}

function columnList(cols: JSONContent[]): JSONContent {
  return {
    type: "columnList",
    attrs: { cols: cols.length },
    content: cols,
  };
}

/** One week block: heading, dates, two 5-column rows, goals, reflection. */
export function weeklyPlannerWeekContent(week: PlannerWeek): JSONContent[] {
  return [
    heading(2, week.title),
    paragraph(week.rangeLabel),
    columnList(DAY_NAMES.slice(0, 5).map((name) => dayColumn(name))),
    columnList([
      dayColumn("Friday"),
      dayColumn("Saturday"),
      emptyColumn(),
      notesColumn(),
      groceriesColumn(),
    ]),
    heading(3, "Goals this week"),
    taskList(2, "Goal"),
    heading(3, "Reflection"),
    {
      type: "blockquote",
      content: [paragraph("What went well? What didn't? What will you change?")],
    },
  ];
}

export function weeklyPlannerButtonNode(): JSONContent {
  return {
    type: "templateButton",
    attrs: {
      label: "New week",
      kind: "weekly-planner",
      contentJson: "[]",
    },
  };
}

/** Full slash-template insert: button on top, then this week's grid. */
export function weeklyPlannerPageContent(now = new Date()): JSONContent[] {
  return [weeklyPlannerButtonNode(), ...weeklyPlannerWeekContent(currentPlannerWeek(now))];
}

export function stripBlockIds(node: JSONContent): JSONContent {
  const attrs = node.attrs ? { ...node.attrs } : undefined;
  if (attrs && "id" in attrs) delete attrs.id;
  return {
    ...node,
    ...(attrs && Object.keys(attrs).length > 0 ? { attrs } : attrs ? {} : {}),
    content: node.content?.map(stripBlockIds),
  };
}

export function parseTemplateButtonContent(raw: unknown): JSONContent[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (node): node is JSONContent =>
        Boolean(node) && typeof node === "object" && typeof (node as JSONContent).type === "string",
    );
  } catch {
    return [];
  }
}
