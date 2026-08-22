import { describe, expect, it } from "vitest";
import type { Entry } from "./journal";
import { matchCollection, matchesFilter, parseCollectionRules, type FilterParams } from "./collections";

function entry(id: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id,
    content: "",
    content_json: null,
    content_storage: "cloud",
    created_at: "2026-08-01T00:00:00.000Z",
    user_id: "u1",
    pinned: false,
    parent_id: null,
    title: id,
    share_token: null,
    layout: {},
    sort_order: null,
    deleted_at: null,
    ...overrides,
  };
}

const titleContains = (value: string): FilterParams => ({
  type: "system",
  key: "title",
  method: "contains",
  value,
});

describe("parseCollectionRules", () => {
  it("returns empty filters for junk input", () => {
    expect(parseCollectionRules(null)).toEqual({ filters: [] });
    expect(parseCollectionRules({ filters: [{ key: "" }] })).toEqual({ filters: [] });
  });

  it("keeps well-formed filter rows", () => {
    expect(
      parseCollectionRules({
        filters: [{ type: "system", key: "title", method: "contains", value: "notes" }],
      }),
    ).toEqual({
      filters: [{ type: "system", key: "title", method: "contains", value: "notes" }],
    });
  });
});

describe("matchesFilter", () => {
  it("never matches a trashed page", () => {
    const trashed = entry("a", { deleted_at: "2026-08-20T00:00:00.000Z", title: "notes" });
    expect(matchesFilter(trashed, titleContains("notes"))).toBe(false);
  });

  it("matches title contains / is", () => {
    const page = entry("a", { title: "Weekly notes" });
    expect(matchesFilter(page, titleContains("week"))).toBe(true);
    expect(matchesFilter(page, { type: "system", key: "title", method: "is", value: "Weekly notes" })).toBe(true);
    expect(matchesFilter(page, { type: "system", key: "title", method: "is", value: "other" })).toBe(false);
  });

  it("matches pinned favorite", () => {
    const pinned = entry("a", { pinned: true });
    expect(matchesFilter(pinned, { type: "system", key: "favorite", method: "is", value: "true" })).toBe(true);
    expect(matchesFilter(pinned, { type: "system", key: "favorite", method: "is", value: "false" })).toBe(false);
  });

  it("matches parent is / is-root", () => {
    const root = entry("root");
    const child = entry("child", { parent_id: "root" });
    expect(matchesFilter(root, { type: "system", key: "parent", method: "is-root" })).toBe(true);
    expect(matchesFilter(child, { type: "system", key: "parent", method: "is-root" })).toBe(false);
    expect(matchesFilter(child, { type: "system", key: "parent", method: "is", value: "root" })).toBe(true);
  });

  it("matches updated within N days using created_at", () => {
    const recent = entry("a", { created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() });
    const old = entry("b", { created_at: new Date(Date.now() - 20 * 86_400_000).toISOString() });
    const filter: FilterParams = { type: "system", key: "updatedAt", method: "within", value: "7" };
    expect(matchesFilter(recent, filter)).toBe(true);
    expect(matchesFilter(old, filter)).toBe(false);
  });

  it("fails closed on unknown keys and types", () => {
    const page = entry("a", { title: "notes" });
    expect(matchesFilter(page, { type: "system", key: "tags", method: "is", value: "x" })).toBe(false);
    expect(matchesFilter(page, { type: "property", key: "title", method: "contains", value: "notes" })).toBe(false);
  });
});

describe("matchCollection", () => {
  const pages = [
    entry("notes", { title: "Writing notes", pinned: true }),
    entry("other", { title: "Shopping" }),
    entry("gone", { title: "Writing gone", deleted_at: "2026-08-20T00:00:00.000Z" }),
  ];

  it("is allow-list only when filters are empty", () => {
    const matched = matchCollection(pages, { rules: { filters: [] }, allowList: ["other", "gone"] });
    expect(matched.map((e) => e.id)).toEqual(["other"]);
  });

  it("intersects filters then unions the allow-list", () => {
    const matched = matchCollection(pages, {
      rules: {
        filters: [
          titleContains("writing"),
          { type: "system", key: "favorite", method: "is", value: "true" },
        ],
      },
      allowList: ["other"],
    });
    expect(matched.map((e) => e.id).sort()).toEqual(["notes", "other"]);
  });

  it("excludes trash even when listed on the allow-list", () => {
    const matched = matchCollection(pages, {
      rules: { filters: [titleContains("writing")] },
      allowList: ["gone"],
    });
    expect(matched.map((e) => e.id)).toEqual(["notes"]);
  });

  it("returns nothing for empty filters and empty allow-list", () => {
    expect(matchCollection(pages, { rules: { filters: [] }, allowList: [] })).toEqual([]);
  });
});
