import { describe, it, expect } from "vitest";
import { caretPosAfterMerge, stepBlockSelection, type BlockDoc } from "./blockUtils";

/** Four top-level blocks at positions 0, 10, 20, 30. */
function doc(positions = [0, 10, 20, 30]): BlockDoc {
  return {
    forEach(fn) {
      positions.forEach((offset) => fn({ nodeSize: 10, copy: () => null }, offset));
    },
    nodeAt: () => null,
    content: { size: 40 },
    resolve: () => {
      throw new Error("not needed");
    },
  };
}

describe("stepBlockSelection", () => {
  it("does nothing when no block is selected", () => {
    expect(stepBlockSelection(doc(), [], null, 1, false)).toBeNull();
  });

  it("moves the selection down one block", () => {
    expect(stepBlockSelection(doc(), [10], 10, 1, false)).toEqual({
      positions: [20],
      anchor: 20,
    });
  });

  it("moves the selection up one block", () => {
    expect(stepBlockSelection(doc(), [10], 10, -1, false)).toEqual({
      positions: [0],
      anchor: 0,
    });
  });

  it("stops at the last block instead of wrapping", () => {
    expect(stepBlockSelection(doc(), [30], 30, 1, false)).toEqual({
      positions: [30],
      anchor: 30,
    });
  });

  it("stops at the first block instead of wrapping", () => {
    expect(stepBlockSelection(doc(), [0], 0, -1, false)).toEqual({
      positions: [0],
      anchor: 0,
    });
  });

  it("collapses a range to the block after the last one", () => {
    expect(stepBlockSelection(doc(), [0, 10, 20], 0, 1, false)).toEqual({
      positions: [30],
      anchor: 30,
    });
  });

  it("extends the range downward and keeps the anchor", () => {
    expect(stepBlockSelection(doc(), [10], 10, 1, true)).toEqual({
      positions: [10, 20],
      anchor: 10,
    });
  });

  it("extends the range upward", () => {
    expect(stepBlockSelection(doc(), [20], 20, -1, true)).toEqual({
      positions: [10, 20],
      anchor: 20,
    });
  });

  it("shrinks the range when travelling back toward the anchor", () => {
    // Anchor at the bottom, head at the top: extending down means shrinking.
    expect(stepBlockSelection(doc(), [0, 10, 20], 20, 1, true)).toEqual({
      positions: [10, 20],
      anchor: 20,
    });
  });

  it("keeps the range put at the edge of the document", () => {
    expect(stepBlockSelection(doc(), [20, 30], 20, 1, true)).toEqual({
      positions: [20, 30],
      anchor: 20,
    });
  });

  it("ignores positions that no longer exist in the document", () => {
    expect(stepBlockSelection(doc(), [999], null, 1, false)).toBeNull();
  });
});

describe("caretPosAfterMerge", () => {
  it("lands after the last character of a textblock, not on it", () => {
    expect(
      caretPosAfterMerge(0, { isTextblock: true, content: { size: 5 }, nodeSize: 7 }, 7),
    ).toBe(6);
  });

  it("lands inside an empty previous paragraph", () => {
    expect(
      caretPosAfterMerge(0, { isTextblock: true, content: { size: 0 }, nodeSize: 2 }, 2),
    ).toBe(1);
  });

  it("lands after an atom such as a divider", () => {
    expect(
      caretPosAfterMerge(0, { isTextblock: false, content: { size: 0 }, nodeSize: 1 }, 1),
    ).toBe(1);
  });
});
