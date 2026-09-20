import { describe, it, expect } from "vitest";
import {
  csvToDatabaseHtml,
  looksLikeNotionExport,
  normalizeNotionMarkdown,
  parentKeyForNotionPath,
  stripNotionTitleId,
} from "./notionImport";

describe("stripNotionTitleId", () => {
  it("removes the trailing 32-char id Notion appends to titles", () => {
    expect(stripNotionTitleId("Reading List a1b2c3d4e5f6789012345678abcdef01")).toBe("Reading List");
  });

  it("leaves ordinary titles alone", () => {
    expect(stripNotionTitleId("Just a page")).toBe("Just a page");
  });

  it("strips a leftover em dash after the Notion id", () => {
    expect(stripNotionTitleId("DBMS notes — 3ddaf5bef03881ab8e29dbba87e6c470")).toBe("DBMS notes");
  });
});

describe("normalizeNotionMarkdown", () => {
  it("lifts the leading H1 into the title and keeps it in the body", () => {
    const { title, body } = normalizeNotionMarkdown("# Projects\n\nHello");
    expect(title).toBe("Projects");
    expect(body.startsWith("# Projects")).toBe(true);
    expect(body).toContain("Hello");
  });

  it("converts Notion page links into wikilinks", () => {
    const { body } = normalizeNotionMarkdown("# Hub\n\nSee [Notes](Notes%20abc.md).");
    expect(body).toContain("[[Notes]]");
  });

  it("converts Notion HTML page links into wikilinks", () => {
    const { body } = normalizeNotionMarkdown("# Hub\n\nSee [Notes](Notes%20abc.html).");
    expect(body).toContain("[[Notes]]");
  });
});

describe("csvToDatabaseHtml", () => {
  it("builds a database block from a Notion CSV export", () => {
    const html = csvToDatabaseHtml("Name,Status\nAlpha,Done\nBeta,In progress");
    expect(html).toContain('data-type="database"');
    expect(html).toContain("Name");
    expect(html).toContain("Alpha");
  });
});

describe("parentKeyForNotionPath", () => {
  it("points a nested file at its folder's markdown page", () => {
    expect(parentKeyForNotionPath("Projects/Notes.md")).toBe("Projects.md");
  });

  it("returns null for top-level files", () => {
    expect(parentKeyForNotionPath("Notes.md")).toBeNull();
  });
});

describe("looksLikeNotionExport", () => {
  it("treats UUID-named HTML as a Notion export", () => {
    const file = new File(["<html></html>"], "DBMS notes 3ddaf5bef03881ab8e29dbba87e6c470.html");
    expect(looksLikeNotionExport([file])).toBe(true);
  });
});
