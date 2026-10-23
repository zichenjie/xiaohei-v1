import { describe, expect, it } from "vitest";
import { EXTRA_ACTIONS, isPetActionName } from "../../src/shared/actions.js";
import { isSoftAction } from "../../src/renderer/pet/behavior/companion.js";
import { softPose, softDuration } from "../../src/renderer/pet/live2d/presenceAnimator.js";

const state = { energy: 75, mood: 60, updatedAt: 0 };

describe("additional gestures", () => {
  for (const { name } of EXTRA_ACTIONS) {
    it(`${name} is playable, stays bounded and returns smoothly to neutral`, () => {
      expect(isPetActionName(name)).toBe(true);
      expect(isSoftAction(name)).toBe(true);
      const duration = softDuration(name, state);
      expect(softDuration(name, { ...state, energy: 10 })).toBe(duration);
      const initial = softPose(name, 0, state, 0);
      const final = softPose(name, duration, state, 0);
      for (const [id, value] of Object.entries(final)) {
        expect(value, id).toBeCloseTo(initial[id], 8);
        expect(value, id).toBeCloseTo(id.endsWith("Open") ? 1 : 0, 8);
      }
      let previous = initial;
      for (let frame = 1; frame <= Math.ceil(duration * 60); frame++) {
        const pose = softPose(name, frame / 60, state, 0);
        for (const [id, value] of Object.entries(pose)) {
          expect(Number.isFinite(value)).toBe(true);
          const angle = id.includes("Angle");
          expect(Math.abs(value), id).toBeLessThanOrEqual(angle ? 12 : 1);
          expect(Math.abs(value - previous[id]), `${id} frame ${frame}`).toBeLessThan(angle ? 1.1 : 0.12);
          if (id.endsWith("Open")) expect(value).toBeGreaterThanOrEqual(0);
        }
        previous = pose;
      }
    });
  }

  it("winks one eye, yawns with both eyes and gives each gesture a distinct pose", () => {
    const wink = softPose("Wink", softDuration("Wink", state) * 0.45, state, 0);
    expect(wink.ParamEyeROpen).toBeLessThan(0.05);
    expect(wink.ParamEyeLOpen).toBe(1);
    const yawn = softPose("Yawn", 2, state, 0);
    expect(yawn.ParamEyeLOpen).toBeLessThan(0.1);
    expect(yawn.ParamEyeROpen).toBeLessThan(0.1);
    expect(yawn.ParamMouthOpenY).toBeGreaterThan(0.5);
    const signatures = EXTRA_ACTIONS.map(({ name }) => JSON.stringify(softPose(name, softDuration(name, state) * 0.4, state, 0)));
    expect(new Set(signatures).size).toBe(EXTRA_ACTIONS.length);
  });
});
