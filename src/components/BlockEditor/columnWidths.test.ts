import { describe, expect, it } from "vitest";
import { parseColumnWidths, resizeColumnPair, serializeColumnWidths } from "./columnWidths";

describe("parseColumnWidths", () => {
  it("fills equal weights when the attr is missing or the count differs", () => {
    expect(parseColumnWidths(null, 3)).toEqual([1, 1, 1]);
    expect(parseColumnWidths("1,2", 3)).toEqual([1, 1, 1]);
    expect(parseColumnWidths("1,0,1", 3)).toEqual([1, 1, 1]);
  });

  it("reads a comma list or number array of the right length", () => {
    expect(parseColumnWidths("2,1,1", 3)).toEqual([2, 1, 1]);
    expect(parseColumnWidths([1.5, 0.5], 2)).toEqual([1.5, 0.5]);
  });
});

describe("resizeColumnPair", () => {
  it("moves weight from the right neighbor onto the left column", () => {
    expect(resizeColumnPair([1, 1, 1], 0, 0.2)).toEqual([1.2, 0.8, 1]);
  });

  it("stops at the minimum so a column cannot vanish", () => {
    const next = resizeColumnPair([0.2, 1], 0, -1);
    expect(next[0]).toBeGreaterThanOrEqual(0.18);
    expect(next[1]).toBeGreaterThan(0);
  });
});

describe("serializeColumnWidths", () => {
  it("round-trips a short decimal list", () => {
    expect(serializeColumnWidths([1, 2, 1])).toBe("1,2,1");
  });
});
