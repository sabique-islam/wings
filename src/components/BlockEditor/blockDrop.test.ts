import { describe, expect, it } from "vitest";
import { dropPlacement } from "./blockDrop";

const rect = { left: 0, width: 200, top: 0, height: 40 };

describe("dropPlacement", () => {
  it("nests on the right half of the block", () => {
    expect(dropPlacement(rect, { x: 150, y: 10 })).toBe("nest");
    expect(dropPlacement(rect, { x: 100, y: 10 })).toBe("nest");
  });

  it("reorders on the left half by Y midpoint", () => {
    expect(dropPlacement(rect, { x: 20, y: 5 })).toBe("before");
    expect(dropPlacement(rect, { x: 20, y: 30 })).toBe("after");
  });
});
