import { describe, expect, it } from "vitest";
import { createBehaviorMachine } from "../../src/renderer/pet/behavior/behaviorMachine.js";

describe("behavior machine", () => {
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
    expect(machine.snapshot().nextAction).toBe("Tap");
  });

  it("does not enter cooldown when idle or hover actions finish", () => {
    const machine = createBehaviorMachine("active");

    machine.send({ type: "motion:finished" });
    expect(machine.snapshot().state).toBe("idle");

    machine.send({ type: "hover:start" });
    expect(machine.snapshot().state).toBe("hover");
    expect(machine.snapshot().nextAction).toBe("Curious");

    machine.send({ type: "motion:finished" });
    expect(machine.snapshot().state).toBe("hover");
  });

  it("keeps click lifecycle active when hover ends during click feedback", () => {
    const machine = createBehaviorMachine("active");

    machine.send({ type: "click" });
    machine.send({ type: "hover:end" });

    expect(machine.snapshot().state).toBe("clicked");
    expect(machine.snapshot().nextAction).toBe("Tap");
  });
});
