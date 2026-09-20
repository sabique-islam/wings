import { afterEach, describe, expect, it } from "vitest";
import {
  isSidebarSectionCollapsed,
  monthSectionId,
  readCollapsedSidebarSections,
  SIDEBAR_SECTION,
  toggleCollapsedSection,
  writeCollapsedSidebarSections,
} from "./sidebarSections";

afterEach(() => {
  localStorage.removeItem("nw:sidebarSectionCollapsed");
});

describe("sidebar section collapse", () => {
  it("starts expanded", () => {
    expect(readCollapsedSidebarSections().size).toBe(0);
    expect(isSidebarSectionCollapsed(new Set(), SIDEBAR_SECTION.pages, false)).toBe(false);
  });

  it("round-trips collapsed ids through localStorage", () => {
    writeCollapsedSidebarSections(new Set([SIDEBAR_SECTION.pinned, monthSectionId("2026-09")]));
    expect([...readCollapsedSidebarSections()].sort()).toEqual(["month:2026-09", "pinned"]);
  });

  it("toggles a section independently of the others", () => {
    const next = toggleCollapsedSection(new Set(["pinned"]), "pages");
    expect(next.has("pinned")).toBe(true);
    expect(next.has("pages")).toBe(true);
    expect(toggleCollapsedSection(next, "pinned").has("pinned")).toBe(false);
  });

  it("ignores collapse while searching", () => {
    expect(isSidebarSectionCollapsed(new Set(["pages"]), "pages", true)).toBe(false);
    expect(isSidebarSectionCollapsed(new Set(["pages"]), "pages", false)).toBe(true);
  });

  it("treats invalid stored JSON as expanded", () => {
    localStorage.setItem("nw:sidebarSectionCollapsed", "{nope");
    expect(readCollapsedSidebarSections().size).toBe(0);
  });
});
