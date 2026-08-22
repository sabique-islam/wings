import { describe, expect, it } from "vitest";
import { parseOrderedListMarker, resolveOrderedListStart } from "./orderedListStart";

describe("parseOrderedListMarker", () => {
  it("reads the number from a 3. marker", () => {
    expect(parseOrderedListMarker("3.")).toBe(3);
    expect(parseOrderedListMarker(" 12. ")).toBe(12);
  });

  it("rejects bullets and zero", () => {
    expect(parseOrderedListMarker("-")).toBeNull();
    expect(parseOrderedListMarker("0.")).toBeNull();
    expect(parseOrderedListMarker("3")).toBeNull();
  });
});

describe("resolveOrderedListStart", () => {
  it("uses the typed start when there is no previous list", () => {
    expect(resolveOrderedListStart(3, null)).toEqual({ start: 3, join: false });
  });

  it("joins when the typed number continues the previous list", () => {
    expect(resolveOrderedListStart(3, { start: 1, itemCount: 2 })).toEqual({
      start: 3,
      join: true,
    });
  });

  it("starts a new list when the typed number does not continue", () => {
    expect(resolveOrderedListStart(3, { start: 1, itemCount: 1 })).toEqual({
      start: 3,
      join: false,
    });
  });
});
