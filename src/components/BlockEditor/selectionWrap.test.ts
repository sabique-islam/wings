import { describe, expect, it } from "vitest";
import {
  innerRangeAfterWrap,
  isBracketWrapped,
  pageIdForTitle,
  shouldSkipCodeCloser,
} from "./selectionWrap";

describe("selectionWrap", () => {
  it("keeps the inner range selected after wrapping", () => {
    expect(innerRangeAfterWrap(1, 4)).toEqual({ from: 2, to: 5 });
  });

  it("detects an already bracket-wrapped selection", () => {
    expect(isBracketWrapped("[", "]")).toBe(true);
    expect(isBracketWrapped("", "]")).toBe(false);
  });

  it("skips a matching closer in a code block", () => {
    expect(shouldSkipCodeCloser(")", ")")).toBe(true);
    expect(shouldSkipCodeCloser(")", "]")).toBe(false);
    expect(shouldSkipCodeCloser("a", "a")).toBe(false);
  });

  it("resolves a page id from a matching title", () => {
    const pages = [{ id: "page-reading-list", title: "Reading List" }];
    expect(pageIdForTitle("Reading List", pages)).toBe("page-reading-list");
    expect(pageIdForTitle("missing", pages)).toBeNull();
  });
});
