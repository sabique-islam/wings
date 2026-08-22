import { describe, expect, it } from "vitest";
import { calloutEmojiFromToken, matchDelimited } from "./markdownInput";

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

describe("calloutEmojiFromToken", () => {
  it("maps GFM names and keeps a known emoji", () => {
    expect(calloutEmojiFromToken("note")).toBe("💬");
    expect(calloutEmojiFromToken("warning")).toBe("⚠️");
    expect(calloutEmojiFromToken("💡")).toBe("💡");
    expect(calloutEmojiFromToken("unknown")).toBe("💡");
  });
});
