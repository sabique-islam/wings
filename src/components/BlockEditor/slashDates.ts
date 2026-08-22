import { addDays, subDays } from "date-fns";

export type SlashDateKind = "today" | "tomorrow" | "yesterday" | "now";

export function formatSlashDay(date: Date): string {
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function formatSlashTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Plain-text date/time inserted by slash commands. */
export function slashDateText(kind: SlashDateKind, now = new Date()): string {
  if (kind === "today") return formatSlashDay(now);
  if (kind === "tomorrow") return formatSlashDay(addDays(now, 1));
  if (kind === "yesterday") return formatSlashDay(subDays(now, 1));
  return formatSlashTime(now);
}
