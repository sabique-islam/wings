import { describe, expect, it } from "vitest";
import {
  calloutEmojiFromToken,
  isHorizontalRuleMarkup,
  matchCodeFenceMarkup,
  matchDelimited,
} from "./markdownInput";

describe("matchDelimited", () => {
  it("converts on the trailing space and keeps inner text", () => {
    expect(matchDelimited("**hi** ", "**")).toEqual({
      index: 0,
      text: "**hi** ",
      replaceWith: "hi",
    });
    expect(matchDelimited("***x*** ", "***")?.replaceWith).toBe("x");
    expect(matchDelimited("`code` ", "`")?.replaceWith).toBe("code");
  });

  it("allows spaces inside but not on the edges", () => {
    expect(matchDelimited("**hello world** ", "**")?.replaceWith).toBe("hello world");
    expect(matchDelimited("** hi** ", "**")).toBeNull();
    expect(matchDelimited("**hi ** ", "**")).toBeNull();
  });

  it("does not convert until space", () => {
    expect(matchDelimited("**hi**", "**")).toBeNull();
  });
});

describe("fence and HR markup", () => {
  it("parses fence tokens with or without a language", () => {
    expect(matchCodeFenceMarkup("```ts")).toEqual({ language: "ts" });
    expect(matchCodeFenceMarkup("```")).toEqual({ language: "" });
    expect(matchCodeFenceMarkup("~~~python")).toEqual({ language: "python" });
    expect(matchCodeFenceMarkup("``` ts")).toBeNull();
    expect(matchCodeFenceMarkup("not a fence")).toBeNull();
  });

  it("accepts three or more rule characters", () => {
    expect(isHorizontalRuleMarkup("---")).toBe(true);
    expect(isHorizontalRuleMarkup("----")).toBe(true);
    expect(isHorizontalRuleMarkup("___")).toBe(true);
    expect(isHorizontalRuleMarkup("***")).toBe(true);
    expect(isHorizontalRuleMarkup("--")).toBe(false);
    expect(isHorizontalRuleMarkup("- - -")).toBe(false);
  });
});

describe("calloutEmojiFromToken", () => {
  it("maps GFM names and keeps a known emoji", () => {
    expect(calloutEmojiFromToken("note")).toBe("💬");
    expect(calloutEmojiFromToken("warning")).toBe("⚠️");
    expect(calloutEmojiFromToken("💡")).toBe("💡");
    expect(calloutEmojiFromToken("unknown")).toBe("💡");
  });
});
