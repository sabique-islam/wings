import { describe, expect, it } from "vitest";
import { slashDateText } from "./slashDates";

describe("slashDateText", () => {
  const noon = new Date("2026-08-22T12:00:00");

  it("returns different calendar days for yesterday, today, and tomorrow", () => {
    const yesterday = slashDateText("yesterday", noon);
    const today = slashDateText("today", noon);
    const tomorrow = slashDateText("tomorrow", noon);
    expect(today).not.toBe(yesterday);
    expect(tomorrow).not.toBe(today);
    expect(tomorrow).not.toBe(yesterday);
  });

  it("returns a time of day for now", () => {
    const now = slashDateText("now", noon);
    expect(now.length).toBeGreaterThan(0);
    expect(now).not.toBe(slashDateText("today", noon));
  });
});
