import { describe, expect, it } from "vitest";
import { createLimbAnimator } from "../../src/renderer/pet/live2d/limbAnimator.js";
import { WALK_STRIDE_UNITS, walkTravel } from "../../src/shared/walk.js";

function fixture(pantsMesh = false, waveMesh = false, thicknessMesh = false) {
  const ids = ["ArtMesh60", "ArtMesh66", "ArtMesh68", "ArtMesh51", "ArtMesh52", "ArtMesh53", "ArtMesh54", "ArtMesh55"];
  const vertexPositions = ids.map((_, index) => new Float32Array(index < 3 ? [0.1, -0.2] : index < 6 ? [-0.1, -0.2] : index === 6 ? [0.04, -0.4] : [-0.04, -0.4]));
  if (pantsMesh) {
    for (const index of [6, 7]) {
      const center = index === 6 ? 0.04 : -0.04;
      vertexPositions[index] = new Float32Array([-0.27, -0.29, -0.34, -0.4].flatMap((y) => [center - 0.027, y, center + 0.027, y]));
    }
  }
  if (waveMesh) {
    for (const index of [3, 4, 5]) vertexPositions[index] = new Float32Array([-0.073, -0.08, -0.085, -0.105, -0.1, -0.16, -0.1, -0.2]);
  }
  if (thicknessMesh) {
    vertexPositions[3] = new Float32Array([-0.08, -0.095, -0.105, -0.12, -0.13, -0.135, -0.14, -0.15, -0.16, -0.18, -0.2].flatMap((y) => {
      const center = -0.073 + (y + 0.08) * 0.225;
      return [center - 0.006, y, center + 0.006, y];
    }));
  }
  const core = { update() {}, getModel: () => ({ drawables: { ids, vertexPositions } }) };
  let time = 0;
  const animator = createLimbAnimator(core, () => time);
  return { core, animator, vertexPositions, advance: (milliseconds: number) => { time = milliseconds; core.update(); } };
}

describe("articulated gestures", () => {
  it("preserves arm thickness through the elbow and shoulder transitions during waving", () => {
    const { animator, vertexPositions, advance } = fixture(false, false, true);
    const mesh = vertexPositions[3];
    animator.start("Greet", 2.8);
    for (let time = 0; time <= 2800; time += 25) {
      advance(time);
      for (let i = 0; i < mesh.length; i += 4) {
        expect(Math.hypot(mesh[i + 2] - mesh[i], mesh[i + 3] - mesh[i + 1])).toBeCloseTo(0.012, 6);
      }
    }
    animator.dispose();
  });

  it.each([-1, 1])("swings arms against the leading leg in direction %s", (direction) => {
    const { core, animator, vertexPositions } = fixture();
    const baseline = vertexPositions.map((vertices) => vertices.slice());
    animator.start("Move", 2.4);
    const progress = 0.232; // First landing, while the opposite foot is planted.
    const stride = WALK_STRIDE_UNITS * direction;
    animator.setWalkFrame({ progress, stride, distance: walkTravel(progress) * stride });
    core.update();
    const leading = (vertexPositions[6][0] - baseline[6][0]) - (vertexPositions[7][0] - baseline[7][0]);
    expect((vertexPositions[0][0] - baseline[0][0]) * leading).toBeLessThan(0);
    expect((vertexPositions[3][0] - baseline[3][0]) * leading).toBeGreaterThan(0);
    animator.stop();
    expect(vertexPositions).toEqual(baseline);
    animator.dispose();
  });

  it("waves both right-arm segments with a fixed shoulder and an unchanged opposite arm", () => {
    const { animator, vertexPositions, advance } = fixture(false, true);
    const baseline = vertexPositions.map((vertices) => vertices.slice());
    animator.start("Greet", 2.8);
    for (let time = 0; time <= 2800; time += 50) {
      advance(time);
      for (const index of [0, 1, 2]) expect(vertexPositions[index]).toEqual(baseline[index]);
      for (const index of [3, 4, 5]) {
        const vertices = vertexPositions[index];
        expect(vertices.slice(0, 2)).toEqual(baseline[index].slice(0, 2));
        expect(Math.hypot(vertices[6] - vertices[4], vertices[7] - vertices[5])).toBeCloseTo(0.04, 5);
      }
    }
    advance(900);
    expect(Math.hypot(vertexPositions[3][2] - baseline[3][2], vertexPositions[3][3] - baseline[3][3])).toBeGreaterThan(0.001);
    animator.dispose();
  });
  it.each([-1, 1])("keeps the crotch attached and pants widths intact throughout walking direction %s", (direction) => {
    const { core, animator, vertexPositions } = fixture(true);
    const baseline = vertexPositions.map((vertices) => vertices.slice());
    animator.start("Move", 2.4);
    for (let frame = 0; frame <= 120; frame++) {
      const progress = frame / 120;
      const stride = WALK_STRIDE_UNITS * direction;
      animator.setWalkFrame({ progress, stride, distance: walkTravel(progress) * stride });
      core.update();
      for (const index of [6, 7]) {
        const vertices = vertexPositions[index];
        expect(vertices.slice(0, 8)).toEqual(baseline[index].slice(0, 8));
        for (let row = 0; row < 4; row++) {
          expect(vertices[row * 4 + 2] - vertices[row * 4]).toBeCloseTo(0.054, 5);
          if (row > 0) expect(vertices[row * 4 + 1]).toBeLessThan(vertices[(row - 1) * 4 + 1]);
        }
      }
    }
    animator.stop();
    expect(vertexPositions).toEqual(baseline);
    animator.dispose();
  });
  it("raises the real hand mesh and restores it when interrupted, without accumulating deformation", () => {
    const { core, animator, vertexPositions, advance } = fixture();
    const baseline = vertexPositions[3].slice();
    animator.start("Greet", 2.8);
    advance(800);
    expect(vertexPositions[3][1]).toBeGreaterThan(baseline[1] + 0.04);
    const raised = vertexPositions[3].slice();
    core.update();
    expect(vertexPositions[3]).toEqual(raised);
    animator.stop();
    expect(vertexPositions[3]).toEqual(baseline);
    core.update();
    expect(vertexPositions[3]).toEqual(baseline);
    animator.dispose();
  });

  it("alternates the two legs and returns both feet to neutral on completion", () => {
    const { animator, vertexPositions, advance } = fixture();
    const baseline = vertexPositions.map((vertices) => vertices.slice());
    animator.start("Move", 1.2);
    advance(120);
    expect(vertexPositions[6][1]).toBeGreaterThan(baseline[6][1]);
    expect(vertexPositions[7][0]).toBeLessThan(baseline[7][0]);
    advance(360);
    expect(vertexPositions[6][0]).toBeLessThan(baseline[6][0]);
    expect(vertexPositions[7][1]).toBeGreaterThan(baseline[7][1]);
    advance(1200);
    expect(vertexPositions).toEqual(baseline);
    animator.dispose();
  });
});
