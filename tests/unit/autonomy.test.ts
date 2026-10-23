import { describe, expect, it } from "vitest";
import { createAutonomy, MINUTE, type AutonomyContext } from "../../src/renderer/pet/behavior/autonomy.js";
import { bubbleLayout } from "../../src/shared/bubbleLayout.js";
import { softPose, SOFT_DURATION } from "../../src/renderer/pet/live2d/presenceAnimator.js";
import { normalizeConfig } from "../../src/main/config.js";

const epoch = 1800000000000;
function scenario(saved?: unknown) {
  const engine = createAutonomy(saved, epoch, () => 0.5);
  const context: AutonomyContext = { now: epoch, energy: 75, mood: 60, initiative: "balanced", autoRest: true, quietUntil: 0, blocked: false, idleSeconds: 0, available: true };
  const advance = (ms: number) => {
    const results: string[] = [];
    const end = context.now + ms;
    while (context.now < end) {
      context.now = Math.min(end, context.now + 1000);
      const result = engine.step(context);
      if (result) results.push(result);
      if (result === "activity") engine.finishActivity(context.now);
    }
    return results;
  };
  return { engine, context, advance };
}

describe("autonomous companionship", () => {
  it("plays a self-directed activity first, invites after 10–15 minutes, and expires after eight seconds", () => {
    const { engine, advance } = scenario();
    expect(advance(9 * MINUTE)).toEqual(["activity"]);
    expect(advance(3.5 * MINUTE)).toEqual(["invite"]);
    expect(engine.invitation?.kind).toBe("play");
    expect(advance(7999)).toEqual([]);
    expect(advance(1)).toEqual(["expired"]);
    expect(engine.memory.misses).toBe(1);
  });

  it("backs off for 30 then 60 minutes and preserves the ignored streak on restart", () => {
    const { engine, advance, context } = scenario();
    advance(13 * MINUTE);
    expect(engine.memory.misses).toBe(1);
    expect(advance(29 * MINUTE)).not.toContain("invite");
    expect(advance(MINUTE)).toContain("invite");
    expect(engine.memory.misses).toBe(2);
    const restored = createAutonomy(engine.memory, context.now);
    expect(restored.memory.misses).toBe(2);
    expect(restored.memory.nextInviteAt).toBe(engine.memory.nextInviteAt);
    expect(advance(59 * MINUTE)).not.toContain("invite");
  });

  it("affection acknowledges an invitation and clears misses; menu actions only defer", () => {
    const { engine, context, advance } = scenario();
    advance(13 * MINUTE);
    engine.interact(context.now, "balanced", "manual");
    expect(engine.memory.misses).toBe(1);
    engine.interact(context.now, "balanced");
    expect(engine.memory.misses).toBe(0);
    advance(12.5 * MINUTE);
    expect(engine.interact(context.now, "balanced")).toBe(true);
    expect(engine.invitation).toBeNull();
    expect(advance(10 * MINUTE)).not.toContain("invite");
  });

  it("never sends more than two invitations in a rolling hour, even after accepted replies", () => {
    const { engine, context, advance } = scenario();
    advance(12.5 * MINUTE); engine.interact(context.now, "active");
    expect(advance(10 * MINUTE)).toContain("invite"); engine.interact(context.now, "active");
    expect(advance(40 * MINUTE)).not.toContain("invite");
    expect(advance(10 * MINUTE)).toContain("invite");
  });

  it("busy reply and quiet mode suppress invitations but still allow low-energy rest", () => {
    const { engine, context, advance } = scenario();
    advance(12.5 * MINUTE);
    engine.interact(context.now, "balanced", "busy");
    context.quietUntil = context.now + 60 * MINUTE;
    expect(advance(59 * MINUTE)).not.toContain("invite");
    context.initiative = "quiet"; context.energy = 25;
    expect(advance(1000)).toEqual(["rest"]);
    expect(engine.finishRest(context)).toBe(true);
  });

  it("rests only after 20 minutes of genuine inactivity with low energy", () => {
    const { engine, context, advance } = scenario();
    context.energy = 25;
    expect(advance(19 * MINUTE)).not.toContain("rest");
    context.available = false;
    expect(advance(2 * MINUTE)).not.toContain("rest");
    context.available = true;
    expect(advance(1000)).toEqual(["rest"]);
    engine.interact(context.now, "balanced");
    expect(engine.finishRest(context)).toBe(false);
    expect(advance(19 * MINUTE)).not.toContain("rest");
  });

  it.each(["blocked", "autoRest"] as const)("cancels the pending sleep if %s changes", (key) => {
    const { engine, context, advance } = scenario();
    context.energy = 25; advance(20 * MINUTE);
    context[key] = key === "blocked";
    expect(engine.finishRest(context)).toBe(false);
  });

  it("system inactivity cancels an invitation without penalizing the user", () => {
    const { engine, context, advance } = scenario();
    advance(12.5 * MINUTE);
    context.idleSeconds = 180;
    expect(advance(1000)).toEqual(["cancel"]);
    expect(engine.memory.misses).toBe(0);
    expect(advance(20 * MINUTE)).not.toContain("invite");
  });

  it("menus, hidden pet and lock context cancel immediately and give a minute of grace", () => {
    const { engine, context, advance } = scenario();
    advance(12.5 * MINUTE);
    context.blocked = true;
    expect(advance(1000)).toEqual(["cancel"]);
    context.blocked = false;
    expect(advance(59000)).not.toContain("invite");
    expect(engine.memory.misses).toBe(0);
  });

  it("suspend/time jumps cancel stale invitations without a burst on resume", () => {
    const { engine, context, advance } = scenario();
    advance(12.5 * MINUTE);
    context.now += 120 * MINUTE;
    expect(engine.step(context)).toBe("cancel");
    expect(advance(59000)).not.toContain("invite");
    expect(engine.memory.misses).toBe(0);
    context.now -= 180 * MINUTE;
    expect(engine.step(context)).toBeNull();
  });

  it("normalizes old config and invalid persistent values", () => {
    expect(normalizeConfig({ pet: { initiative: "spam", autoRest: "yes", quietUntil: Infinity } }).pet)
      .toMatchObject({ initiative: "balanced", autoRest: true, quietUntil: 0 });
    const { engine } = scenario({ lastInteractionAt: NaN, nextInviteAt: Infinity, misses: 900, invitations: [null, "a", epoch + 1], lastKind: "wrong" });
    expect(engine.memory).toMatchObject({ lastInteractionAt: epoch, misses: 2, invitations: [], lastKind: "touch" });
    expect(Number.isFinite(engine.memory.nextInviteAt)).toBe(true);
  });

  it("sleep preparation closes eyes progressively and holds them closed at completion", () => {
    const state = { energy: 25, mood: 60, updatedAt: epoch };
    const duration = SOFT_DURATION.Settle * 1.1;
    let previous = 1;
    for (let t = 0; t <= duration + 1; t += 0.03) {
      const eye = softPose("Settle", t, state, 0).ParamEyeLOpen;
      expect(eye).toBeLessThanOrEqual(previous + 0.00001);
      expect(previous - eye).toBeLessThan(0.03);
      previous = eye;
    }
    expect(previous).toBeCloseTo(0.02);
  });

  it.each([0.4, 1, 2])("keeps bubbles legible and inside work areas at scale %s including negative monitors", (scale) => {
    const work = { x: -1920, y: 40, width: 1920, height: 1000 };
    for (const x of [-1920, -360 * scale]) for (const y of [40, 1040 - 520 * scale]) {
      const result = bubbleLayout({ x, y, width: 360 * scale, height: 520 * scale }, { x: 180 * scale, y: 40 * scale, width: 55 * scale }, work);
      expect(result.width).toBeGreaterThanOrEqual(210);
      expect(result.x).toBeGreaterThanOrEqual(work.x);
      expect(result.y).toBeGreaterThanOrEqual(work.y);
      expect(result.x + result.width).toBeLessThanOrEqual(0);
      expect(result.y + result.height).toBeLessThanOrEqual(1040);
    }
  });
});
