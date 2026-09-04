import { describe, expect, it } from "vitest";
import { auroraBarScale } from "./AuroraBars";

describe("auroraBarScale", () => {
  it("stays between min and max", () => {
    for (let i = 0; i < 24; i += 1) {
      const y = auroraBarScale(i, 24, 0, 0.08, 0.82, true);
      expect(y).toBeGreaterThanOrEqual(0.08);
      expect(y).toBeLessThanOrEqual(0.82);
    }
  });

  it("inverts the arch so edges are taller than the center", () => {
    const edge = auroraBarScale(0, 24, 0, 0.08, 0.82, true);
    const center = auroraBarScale(12, 24, 0, 0.08, 0.82, true);
    expect(edge).toBeGreaterThan(center);
  });
});
