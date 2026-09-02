import type { JSONContent } from "@tiptap/core";

/** Gray bar on day headings — same token as block-menu gray (`BG_COLORS`). */
export const PLANNER_HEADING_BG = "#f1f1ef";

const MS_PER_DAY = 86_400_000;
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

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

export function plannerDayName(date: Date): (typeof DAY_NAMES)[number] {
  return DAY_NAMES[date.getDay()]!;
}

export function weekContainsDate(sunday: Date, date: Date): boolean {
  const start = sundayOf(sunday).getTime();
  const end = addDays(sundayOf(sunday), 6).getTime();
  const t = atLocalNoon(date).getTime();
  return t >= start && t <= end;
}

/** Newest Sunday among range labels — independent of document order. */
export function latestPlannerSunday(sundays: Date[]): Date | null {
  if (!sundays.length) return null;
  return sundays.reduce((latest, sunday) => (sunday.getTime() > latest.getTime() ? sunday : latest));
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

function jsonTextContent(node: JSONContent): string {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(jsonTextContent).join("");
}

function isEmptyParagraphNode(node: JSONContent): boolean {
  if (node.type !== "paragraph") return false;
  return jsonTextContent(node).trim().length === 0;
}

function isWeekHeadingNode(node: JSONContent): boolean {
  if (node.type === "heading") return parseWeekHeading(jsonTextContent(node)) != null;
  if (node.type === "outlineBlock" && node.content?.[0]) return isWeekHeadingNode(node.content[0]);
  return false;
}

function isPlannerButton(node: JSONContent): boolean {
  return node.type === "templateButton" && String(node.attrs?.kind ?? "") === "weekly-planner";
}

function hasUnwrappedPlannerWeek(nodes: JSONContent[]): boolean {
  return nodes.some((node) => node.type !== "weekCard" && isWeekHeadingNode(node));
}

function looksLikePlannerDoc(nodes: JSONContent[]): boolean {
  if (nodes.some(isPlannerButton)) return true;
  const hasWeek = nodes.some((node) => isWeekHeadingNode(node) || node.type === "weekCard");
  const hasColumns = nodes.some((node) => {
    if (node.type === "columnList") return true;
    if (node.type === "weekCard") return (node.content ?? []).some((child) => child.type === "columnList");
    return false;
  });
  return hasWeek && hasColumns;
}

function wrapWeekChunk(chunk: JSONContent[]): JSONContent {
  return { type: "weekCard", content: chunk };
}

function weekCardTimestamp(node: JSONContent): number {
  for (const child of node.content ?? []) {
    if (child.type === "paragraph") {
      const sunday = parseWeekRangeLabel(jsonTextContent(child));
      if (sunday) return sunday.getTime();
    }
  }
  for (const child of node.content ?? []) {
    const n = child.type === "heading" ? parseWeekHeading(jsonTextContent(child)) : null;
    if (n != null) return n;
  }
  return 0;
}

/** Consecutive week cards, newest Sunday first. Same nodes if already ordered. */
function orderPlannerWeeksNewestFirst(nodes: JSONContent[]): JSONContent[] {
  let changed = false;
  const out: JSONContent[] = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i]!;
    if (node.type !== "weekCard") {
      out.push(node);
      i += 1;
      continue;
    }
    const start = i;
    while (i < nodes.length && nodes[i]!.type === "weekCard") i += 1;
    const run = nodes.slice(start, i);
    const sorted = [...run].sort((a, b) => weekCardTimestamp(b) - weekCardTimestamp(a));
    if (sorted.some((card, index) => card !== run[index])) changed = true;
    out.push(...sorted);
  }
  return changed ? out : nodes;
}

function wrapPlannerWeekNodes(nodes: JSONContent[]): JSONContent[] {
  const next: JSONContent[] = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i]!;
    if (node.type === "weekCard" || isPlannerButton(node)) {
      next.push(node);
      i += 1;
      continue;
    }
    if (!isWeekHeadingNode(node)) {
      next.push(node);
      i += 1;
      continue;
    }

    const start = i;
    i += 1;
    while (i < nodes.length) {
      const following = nodes[i]!;
      if (following.type === "weekCard" || isPlannerButton(following) || isWeekHeadingNode(following)) break;
      i += 1;
    }

    let end = i;
    while (end > start + 1 && isEmptyParagraphNode(nodes[end - 1]!)) end -= 1;
    const chunk = nodes.slice(start, end);
    if (chunk.length) next.push(wrapWeekChunk(chunk));
    while (end < i) {
      next.push(nodes[end]!);
      end += 1;
    }
  }
  return next;
}

/**
 * Wrap legacy flat Week-N sequences in isolating `weekCard` nodes, then put
 * newest weeks first. Structure only: text content is unchanged. Never wraps
 * the New week button.
 */
export function normalizeWeeklyPlannerDoc(doc: JSONContent): JSONContent {
  if (doc.type !== "doc") return doc;
  const nodes = doc.content ?? [];
  if (!looksLikePlannerDoc(nodes)) return doc;

  const wrapped = hasUnwrappedPlannerWeek(nodes) ? wrapPlannerWeekNodes(nodes) : nodes;
  const ordered = orderPlannerWeeksNewestFirst(wrapped);
  if (wrapped === nodes && ordered === wrapped) return doc;
  return { ...doc, content: ordered };
}

/** Inner blocks for one week (heading, days, goals, reflection). */
export function weeklyPlannerWeekInnerContent(week: PlannerWeek): JSONContent[] {
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

/** One isolating week card. */
export function weeklyPlannerWeekContent(week: PlannerWeek): JSONContent[] {
  return [wrapWeekChunk(weeklyPlannerWeekInnerContent(week))];
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
