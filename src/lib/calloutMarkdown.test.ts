import { describe, expect, it } from "vitest";
import {
  calloutEmojiFromToken,
  findGfmCalloutBlocks,
  parseGfmCalloutLine,
} from "./calloutMarkdown";

describe("parseGfmCalloutLine", () => {
  it("reads [!emoji] and Obsidian [!note] Title", () => {
    expect(parseGfmCalloutLine("> [!💡]")).toEqual({ token: "💡", title: "" });
    expect(parseGfmCalloutLine("> [!warning] Title")).toEqual({
      token: "warning",
      title: "Title",
    });
    expect(parseGfmCalloutLine("> [!NOTE]")).toEqual({ token: "NOTE", title: "" });
  });

  it("ignores ordinary quotes", () => {
    expect(parseGfmCalloutLine("> just a quote")).toBeNull();
  });
});

describe("calloutEmojiFromToken", () => {
  it("maps Obsidian names onto Wings picker icons", () => {
    expect(calloutEmojiFromToken("note")).toBe("💬");
    expect(calloutEmojiFromToken("warning")).toBe("⚠️");
    expect(calloutEmojiFromToken("💡")).toBe("💡");
    expect(calloutEmojiFromToken("unknown")).toBe("💡");
  });
});

describe("findGfmCalloutBlocks", () => {
  it("captures the quoted body and skips fenced decoys", () => {
    const md = "> [!note]\n> body\n\n```\n> [!note]\n> not a callout\n```\n";
    const blocks = findGfmCalloutBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.token).toBe("note");
    expect(blocks[0]?.body).toContain("body");
  });
});
