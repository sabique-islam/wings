import { describe, it, expect } from "vitest";
import { matchPages, wikiLinkQuery } from "./pageSuggestions";

const pages = [
  { id: "1", title: "Reading List" },
  { id: "2", title: "Release Notes" },
  { id: "3", title: "" },
];

describe("matchPages", () => {
  it("returns everything when nothing has been typed", () => {
    expect(matchPages(pages, "  ").map((p) => p.id)).toEqual(["1", "2", "3"]);
  });

  it("ranks closer titles first", () => {
    expect(matchPages(pages, "Release")[0]!.id).toBe("2");
  });

  it("drops pages that don't match", () => {
    expect(matchPages(pages, "zzzz")).toEqual([]);
  });
});

describe("wikiLinkQuery", () => {
  it("stops at the closing brackets", () => {
    expect(wikiLinkQuery("Ideas]] and more text")).toBe("Ideas");
  });

  it("passes through a query that is still being typed", () => {
    expect(wikiLinkQuery(" Reading Lis")).toBe("Reading Lis");
  });

  it("handles the alias form", () => {
    expect(wikiLinkQuery("Ideas|shortname]]")).toBe("Ideas|shortname");
  });

  it("stops at fullwidth closing brackets", () => {
    expect(wikiLinkQuery("Ideas】】 and more")).toBe("Ideas");
  });
});
