import { describe, expect, it } from "vitest";
import { footPlacement, walkFacing, walkTravel } from "../../src/shared/walk.js";

describe("foot contact", () => {
  it("keeps the middle steps at a steady speed with smooth starts and stops", () => {
    const increments = [0.2, 0.3, 0.4, 0.5].map((p) => walkTravel(p + 0.05) - walkTravel(p));
    expect(Math.max(...increments) - Math.min(...increments)).toBeLessThan(0.000001);
    expect(walkTravel(0.001)).toBeLessThan(0.00001);
    expect(4 - walkTravel(0.799)).toBeLessThan(0.00001);
  });

  it("keeps foot positions continuous through lift, landing, and the closing step", () => {
    for (const side of ["right", "left"] as const) {
      for (let frame = 1; frame < 1000; frame++) {
        const p = frame / 1000;
        const before = footPlacement(p - 0.001, side, walkTravel(p - 0.001) * 0.026, 0.026);
        const after = footPlacement(p, side, walkTravel(p) * 0.026, 0.026);
        expect(Math.abs(after.x - before.x)).toBeLessThan(0.0005);
        expect(Math.abs(after.lift - before.lift)).toBeLessThan(0.0005);
      }
    }
  });

  it("turns toward travel and eases back to the front after stopping", () => {
    for (const direction of [-1, 1]) {
      expect(walkFacing(0, direction)).toBeCloseTo(0);
      expect(walkFacing(0.4, direction)).toBe(direction);
      expect(walkFacing(0.9, direction) * direction).toBeGreaterThan(0);
      expect(walkFacing(0.9, direction) * direction).toBeLessThan(1);
      expect(Math.abs(walkFacing(1, direction))).toBeLessThan(0.00001);
    }
  });
  it.each([0.06, -0.06, 0.025])("holds each planted sole at its world position for stride %s", (stride) => {
    for (let frame = 1; frame < 80; frame++) {
      const progress = frame / 100;
      const step = Math.floor(walkTravel(progress));
      const side = step % 2 === 0 ? "left" : "right";
      // Include native-window rounding error: stance must compensate actual
      // displacement, rather than just the ideal curve.
      const actualDistance = walkTravel(progress) * stride + 0.001;
      const foot = footPlacement(progress, side, actualDistance, stride);
      expect(actualDistance + foot.x).toBeCloseTo(step * stride, 8);
      expect(foot.lift).toBe(0);
    }
  });

  it("closes the trailing foot while the body remains stationary", () => {
    expect(walkTravel(0.8)).toBe(4);
    expect(walkTravel(0.9)).toBe(4);
    expect(walkTravel(1)).toBe(4);
    expect(footPlacement(0.9, "right", 0.24, 0.06).lift).toBeGreaterThan(0);
    for (const side of ["right", "left"] as const) {
      expect(footPlacement(1, side, 0.24, 0.06).x).toBeCloseTo(0);
      expect(footPlacement(1, side, 0.24, 0.06).lift).toBeCloseTo(0);
    }
  });
});
