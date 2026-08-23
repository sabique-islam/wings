import { describe, expect, it } from "vitest";
import {
  blocksInSweep,
  pointInRect,
  rectIncludesVertically,
  rectIntersects,
  sweepRectFromPoints,
  type SweepBlock,
  type SweepRect,
} from "./blockSweep";

function rect(left: number, top: number, width: number, height: number): SweepRect {
  return { left, top, width, height };
}

function block(pos: number, top: number, extras: Partial<SweepBlock> = {}): SweepBlock {
  return {
    pos,
    parentPos: extras.parentPos ?? null,
    isWrapper: extras.isWrapper ?? false,
    rect: extras.rect ?? rect(0, top, 400, 24),
  };
}

describe("sweepRectFromPoints", () => {
  it("is the same box whether you drag up or down", () => {
    expect(sweepRectFromPoints(10, 80, 12, 20)).toEqual(sweepRectFromPoints(12, 20, 10, 80));
  });
});

describe("rectIntersects", () => {
  it("detects overlap and misses", () => {
    expect(rectIntersects(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(true);
    expect(rectIntersects(rect(0, 0, 10, 10), rect(20, 20, 10, 10))).toBe(false);
    expect(rectIntersects(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(false);
  });
});

describe("rectIncludesVertically", () => {
  it("is true when outer covers inner top and bottom", () => {
    expect(rectIncludesVertically(rect(0, 0, 100, 200), rect(10, 40, 80, 20))).toBe(true);
    expect(rectIncludesVertically(rect(0, 40, 100, 20), rect(0, 0, 100, 200))).toBe(false);
  });
});

describe("pointInRect", () => {
  it("includes the edges", () => {
    const box = rect(10, 10, 20, 20);
    expect(pointInRect(10, 10, box)).toBe(true);
    expect(pointInRect(30, 30, box)).toBe(true);
    expect(pointInRect(9, 15, box)).toBe(false);
  });
});

describe("blocksInSweep", () => {
  const stacked = [block(0, 0), block(10, 30), block(20, 60), block(30, 90)];

  it("selects the same positions for an upward and a downward sweep", () => {
    const down = sweepRectFromPoints(8, 8, 8, 80);
    const up = sweepRectFromPoints(8, 80, 8, 8);
    expect(blocksInSweep(stacked, down)).toEqual([0, 10, 20]);
    expect(blocksInSweep(stacked, up)).toEqual([0, 10, 20]);
  });

  it("includes a block whose rect the sweep only clips", () => {
    expect(blocksInSweep(stacked, sweepRectFromPoints(8, 70, 8, 100))).toEqual([20, 30]);
  });

  it("selects children when the sweep sits inside a wrapper", () => {
    const wrapper = block(0, 0, { isWrapper: true, rect: rect(0, 0, 400, 120) });
    const childA = block(1, 8, { parentPos: 0, rect: rect(16, 8, 360, 24) });
    const childB = block(8, 40, { parentPos: 0, rect: rect(16, 40, 360, 24) });
    const sibling = block(40, 140, { rect: rect(0, 140, 400, 24) });
    const sweep = sweepRectFromPoints(20, 10, 20, 50);
    expect(blocksInSweep([wrapper, childA, childB, sibling], sweep)).toEqual([1, 8]);
  });

  it("drops a child when its parent is already selected", () => {
    const parent = block(0, 0, { isWrapper: true, rect: rect(0, 0, 400, 80) });
    const child = block(1, 8, { parentPos: 0, rect: rect(16, 8, 360, 24) });
    const below = block(20, 100, { rect: rect(0, 100, 400, 24) });
    const sweep = sweepRectFromPoints(4, 4, 4, 110);
    expect(blocksInSweep([parent, child, below], sweep)).toEqual([0, 20]);
  });

  it("returns nothing when the sweep misses every block", () => {
    expect(blocksInSweep(stacked, sweepRectFromPoints(500, 0, 520, 10))).toEqual([]);
  });
});
