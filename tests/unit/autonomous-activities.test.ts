import { describe, expect, it } from "vitest";
import { createAutonomy, MINUTE, type AutonomyContext } from "../../src/renderer/pet/behavior/autonomy.js";
import { chooseAutonomousActivity, rewardInteraction, type AutonomousActivity } from "../../src/renderer/pet/behavior/companion.js";

const now = 1800000000000;
const context = (): AutonomyContext => ({ now, energy: 80, mood: 85, initiative: "balanced", autoRest: false,
  quietUntil: 0, blocked: false, idleSeconds: 0, available: true });
function setup(extra = {}) {
  const engine = createAutonomy({ lastInteractionAt: now - 10 * MINUTE, nextObserveAt: now - 1, nextInviteAt: now + 60 * MINUTE, activities: [], ...extra }, now, () => 0);
  const c = context();
  const tick = (seconds = 1) => {
    const events: Array<{ at: number; decision: string; action: AutonomousActivity | null }> = [];
    for (let i = 0; i < seconds; i++) {
      c.now += 1000;
      const decision = engine.step(c);
      if (decision) events.push({ at: c.now, decision, action: engine.activity });
    }
    return events;
  };
  return { engine, c, tick };
}

describe("autonomous expressions", () => {
  it("chooses all six gestures in appropriate moods while fatigue wins over excitement", () => {
    const seen = new Set<string>();
    for (const [energy, mood] of [[85, 85], [80, 60], [75, 30], [25, 85]]) {
      for (let n = 0; n < 100; n++) {
        const action = chooseAutonomousActivity({ energy, mood }, [], n / 100);
        seen.add(action);
        if (energy <= 35) expect(["Yawn", "Relax", "Drowsy"]).toContain(action);
        if (mood < 45) expect(["Wink", "Sway"]).not.toContain(action);
      }
    }
    for (const action of ["Nod", "ShakeHead", "Wink", "Shy", "Yawn", "Sway"]) expect(seen.has(action)).toBe(true);
  });

  it("avoids the last two activities and does not reward self-generated affection", () => {
    for (let n = 0; n <= 10; n++) expect(["Wink", "Sway"]).not.toContain(chooseAutonomousActivity({ energy: 90, mood: 90 }, ["Wink", "Sway"], n / 10));
    const state = { energy: 80, mood: 80, updatedAt: now };
    for (const action of ["Nod", "Wink", "Shy", "Sway"]) {
      expect(rewardInteraction(state, action, false).mood).toBe(80);
      expect(rewardInteraction(state, action, true).mood).toBeGreaterThan(80);
    }
    expect(rewardInteraction(state, "Sway", false).energy).toBeLessThan(80);
  });

  it("serializes activities, reserves five minutes and remembers the selection and quota", () => {
    const { engine, c, tick } = setup();
    expect(tick(60)).toEqual([{ at: now + MINUTE, decision: "activity", action: "Wink" }]);
    expect(tick(20)).toEqual([]);
    const lastAttention = engine.memory.lastInteractionAt;
    engine.finishActivity(c.now);
    expect(engine.memory.nextObserveAt).toBe(now + 6 * MINUTE);
    expect(engine.memory.lastInteractionAt).toBe(lastAttention);
    const restored = createAutonomy(engine.memory, c.now, () => 0);
    expect(restored.memory.activities).toEqual([now + MINUTE]);
    expect(restored.memory.recentActivities).toEqual(["Wink"]);
    expect(restored.memory.nextObserveAt).toBe(engine.memory.nextObserveAt);
    expect(tick(279)).toEqual([]);
    expect(tick(1)[0].action).not.toBe("Wink");
  });

  it("caps expressions at six per rolling hour, including after restarts", () => {
    const { engine, c, tick } = setup();
    const actions: string[] = [];
    for (let i = 0; i < 3600; i++) {
      for (const event of tick()) if (event.decision === "activity") { actions.push(event.action!); engine.finishActivity(c.now); }
    }
    expect(actions).toHaveLength(6);
    const restored = createAutonomy(engine.memory, c.now, () => 0);
    expect(restored.memory.activities).toHaveLength(6);
    expect(restored.memory.recentActivities).toHaveLength(2);
  });

  it.each(["blocked", "available", "quiet", "busy", "idle"])("suppresses new gestures during %s", (reason) => {
    const { engine, c, tick } = setup();
    if (reason === "blocked") c.blocked = true;
    if (reason === "available") c.available = false;
    if (reason === "quiet") c.initiative = "quiet";
    if (reason === "busy") c.quietUntil = now + 60 * MINUTE;
    if (reason === "idle") c.idleSeconds = 180;
    expect(tick(10 * 60)).toEqual([]);
    expect(engine.memory.activities).toHaveLength(0);
  });

  it("an invitation or needed rest takes priority and never follows a gesture immediately", () => {
    const { engine, c, tick } = setup();
    tick(60); engine.finishActivity(c.now);
    engine.memory.nextInviteAt = c.now;
    expect(tick(44)).toEqual([]);
    expect(tick(1)[0].decision).toBe("invite");
    const rest = setup({ lastInteractionAt: now - 30 * MINUTE });
    rest.c.energy = 20; rest.c.autoRest = true;
    expect(rest.tick(60)[0].decision).toBe("rest");
    expect(rest.engine.memory.activities).toHaveLength(0);
  });

  it("real input cancels a pending activity and postpones the next one; busy lasts an hour", () => {
    const { engine, c, tick } = setup();
    tick(60);
    engine.interact(c.now, "balanced", "manual");
    expect(engine.activity).toBeNull();
    expect(tick(299)).toEqual([]);
    expect(tick(1)[0].decision).toBe("activity");
    engine.interact(c.now, "balanced", "busy");
    expect(engine.memory.nextObserveAt).toBe(c.now + 60 * MINUTE);
    expect(tick(59 * 60)).toEqual([]);
  });

  it("continuous ignores lengthen expression delays as well as invitation delays", () => {
    const { engine, c, tick } = setup({ misses: 2 });
    tick(60);
    expect(engine.memory.nextObserveAt - c.now).toBe(30 * MINUTE);
    engine.finishActivity(c.now);
    expect(tick(25 * 60)).toEqual([]);
  });

  it("blocked activity is cancelled, then resumes with grace without replaying a queue", () => {
    const { engine, c, tick } = setup();
    tick(60); c.blocked = true;
    expect(tick(1)[0].decision).toBe("cancel");
    expect(engine.activity).toBeNull();
    c.blocked = false;
    expect(tick(59)).toEqual([]);
    c.now += 2 * 60 * MINUTE;
    expect(engine.step(c)).toBeNull();
    expect(tick(59)).toEqual([]);
    expect(tick(1).filter((e) => e.decision === "activity").length).toBeLessThanOrEqual(1);
  });

  it("migrates legacy observation timing and rejects malformed activity memory", () => {
    const engine = createAutonomy({ nextObserveAt: now + 20 * MINUTE, recentActivities: ["Sleep", "garbage", "Wink", "Nod", "Sway"], activities: undefined, nextAutonomousAt: Infinity }, now, () => 0);
    expect(engine.memory.nextObserveAt).toBe(now + 5 * MINUTE);
    expect(engine.memory.recentActivities).toEqual(["Nod", "Sway"]);
    expect(engine.memory.activities).toEqual([]);
    expect(engine.memory.nextAutonomousAt).toBe(now);
    expect(createAutonomy({ misses: 2, nextObserveAt: now - 1 }, now, () => 0).memory.nextObserveAt).toBe(now + 30 * MINUTE);
  });
});
