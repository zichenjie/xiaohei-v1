import { describe, expect, it } from "vitest";
import { createBehaviorMachine } from "../../src/renderer/pet/behavior/behaviorMachine.js";

describe("behavior machine", () => {
  it("keeps sleeping through hover, timers, body clicks, and dragging", () => {
    const machine = createBehaviorMachine("active");
    machine.send({ type: "action", action: "Sleep" });
    for (const event of [{ type: "hover:start" }, { type: "hover:end" }, { type: "idle:tick" }, { type: "click", target: "body" }, { type: "double:click", target: "body" }, { type: "hold:start" }, { type: "hold:end" }, { type: "drag:start" }, { type: "drag:end" }, { type: "cooldown:finished" }, { type: "motion:finished" }] as const) {
      expect(machine.send(event)).toBe(false);
      expect(machine.snapshot()).toMatchObject({ state: "sleeping", nextAction: "none" });
    }
  });

  it.each(["click", "double:click"] as const)("only wakes on a head %s and finishes back at idle", (type) => {
    const machine = createBehaviorMachine("quiet");
    machine.send({ type: "action", action: "Sleep" });
    expect(machine.send({ type, target: "head" })).toBe(true);
    expect(machine.snapshot()).toMatchObject({ state: "clicked", nextAction: "Wake" });
    machine.send({ type: "motion:finished" });
    machine.send({ type: "cooldown:finished" });
    expect(machine.snapshot()).toMatchObject({ state: "idle", nextAction: "Idle" });
  });

  it("also latches sleep started by an idle variation", () => {
    const machine = createBehaviorMachine("active");
    machine.send({ type: "idle:tick" });
    machine.send({ type: "sleep:started" });
    machine.setMode("quiet");
    expect(machine.send({ type: "idle:tick" })).toBe(false);
    expect(machine.snapshot().state).toBe("sleeping");
  });

  it("prioritizes dragging over click and hover", () => {
    const machine = createBehaviorMachine("active");

    machine.send({ type: "hover:start" });
    machine.send({ type: "drag:start" });
    machine.send({ type: "click" });

    expect(machine.snapshot().state).toBe("dragging");
    expect(machine.snapshot().nextAction).toBe("none");
  });

  it("uses tap feedback for click and cooldown afterward", () => {
    const machine = createBehaviorMachine("active");

    machine.send({ type: "click" });

    expect(machine.snapshot().state).toBe("clicked");
    expect(machine.snapshot().nextAction).toBe("Tap");

    machine.send({ type: "motion:finished" });

    expect(machine.snapshot().state).toBe("cooldown");
    expect(machine.snapshot().nextAction).toBe("none");
  });

  it("blocks new click feedback during cooldown", () => {
    const machine = createBehaviorMachine("quiet");

    machine.send({ type: "click" });

    expect(machine.snapshot().state).toBe("clicked");
    expect(machine.snapshot().nextAction).toBe("Tap");

    machine.send({ type: "motion:finished" });
    machine.send({ type: "click" });

    expect(machine.snapshot().state).toBe("cooldown");
    expect(machine.snapshot().nextAction).toBe("none");
  });

  it("uses happy feedback for double click without triggering drag animation", () => {
    const machine = createBehaviorMachine("active");

    machine.send({ type: "double:click" });
    expect(machine.snapshot().state).toBe("clicked");
    expect(machine.snapshot().nextAction).toBe("Happy");

    machine.send({ type: "motion:finished" });
    machine.send({ type: "cooldown:finished" });
    machine.send({ type: "drag:start" });
    expect(machine.snapshot().state).toBe("dragging");
    expect(machine.snapshot().nextAction).toBe("none");

    machine.send({ type: "drag:end" });

    expect(machine.snapshot().state).toBe("cooldown");
    expect(machine.snapshot().nextAction).toBe("none");
  });

  it("emits idle variants only from idle state", () => {
    const machine = createBehaviorMachine("active");

    machine.send({ type: "idle:tick" });
    expect(machine.snapshot().state).toBe("idle");
    expect(machine.snapshot().nextAction).toBe("IdleVariant");

    machine.send({ type: "click" });
    machine.send({ type: "idle:tick" });
    expect(machine.snapshot().state).toBe("clicked");
    expect(machine.snapshot().nextAction).toBe("none");
  });

  it("does not enter cooldown when idle or hover actions finish", () => {
    const machine = createBehaviorMachine("active");

    machine.send({ type: "motion:finished" });
    expect(machine.snapshot().state).toBe("idle");

    machine.send({ type: "hover:start" });
    expect(machine.snapshot().state).toBe("hover");
    expect(machine.snapshot().nextAction).toBe("none");

    machine.send({ type: "motion:finished" });
    expect(machine.snapshot().state).toBe("hover");
  });

  it("keeps click lifecycle active when hover ends during click feedback", () => {
    const machine = createBehaviorMachine("active");

    machine.send({ type: "click" });
    machine.send({ type: "hover:end" });

    expect(machine.snapshot().state).toBe("clicked");
    expect(machine.snapshot().nextAction).toBe("none");
  });

  it("allows a manual action to reset cooldown and accepts clicks afterward", () => {
    const machine = createBehaviorMachine("quiet");
    machine.send({ type: "click" });
    machine.send({ type: "motion:finished" });
    expect(machine.send({ type: "click" })).toBe(false);
    expect(machine.send({ type: "action", action: "Sleep" })).toBe(true);
    expect(machine.snapshot().state).toBe("sleeping");
    expect(machine.send({ type: "click", target: "head" })).toBe(true);
    expect(machine.snapshot().nextAction).toBe("Wake");
  });

  it("still emits idle activity while hovered", () => {
    const machine = createBehaviorMachine("quiet");
    machine.send({ type: "hover:start" });
    machine.send({ type: "idle:tick" });
    expect(machine.snapshot().nextAction).toBe("IdleVariant");
    machine.send({ type: "motion:finished" });
    expect(machine.snapshot().nextAction).toBe("none");
  });
});
