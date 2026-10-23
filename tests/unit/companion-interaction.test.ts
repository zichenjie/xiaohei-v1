import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceCompanion, chooseIdle, classifyHeadPoint, restoreCompanion, rewardInteraction } from "../../src/renderer/pet/behavior/companion.js";
import { createBehaviorMachine } from "../../src/renderer/pet/behavior/behaviorMachine.js";
import { createPointerInteraction, type InputHandlers } from "../../src/renderer/pet/input/pointerInteraction.js";
import { approach, softPose } from "../../src/renderer/pet/live2d/presenceAnimator.js";

afterEach(() => vi.useRealTimers());
const state = { energy: 70, mood: 60, updatedAt: 0 };
const point = (x = 100, y = 100) => ({ x, y, screenX: x, screenY: y, pointerId: 1 });
function input() {
  vi.useFakeTimers();
  const handlers: InputHandlers = {
    locked: false, targetAt: () => "head", canStroke: () => true,
    onClick: vi.fn(), onDoubleClick: vi.fn(), onStrokeStart: vi.fn(), onStrokeMove: vi.fn(), onStrokeEnd: vi.fn(),
    onDragStart: vi.fn(), onDragMove: vi.fn(), onDragEnd: vi.fn(), onHoverStart: vi.fn(), onHoverEnd: vi.fn(), onFocus: vi.fn()
  };
  return { handlers, controller: createPointerInteraction(() => handlers) };
}

describe("gesture arbitration", () => {
  it("holds the head to stroke, follows pointer movement, and releases without click or drag", () => {
    const { handlers: h, controller: c } = input();
    c.down(point()); vi.advanceTimersByTime(300); c.move(point(160)); c.up(point(160)); vi.runAllTimers();
    expect(h.onStrokeStart).toHaveBeenCalledOnce(); expect(h.onStrokeMove).toHaveBeenCalledOnce(); expect(h.onStrokeEnd).toHaveBeenCalledOnce();
    expect(h.onClick).not.toHaveBeenCalled(); expect(h.onDragStart).not.toHaveBeenCalled();
  });
  it("quick movement becomes drag and cancels pending hold", () => {
    const { handlers: h, controller: c } = input();
    c.down(point()); c.move(point(112)); vi.advanceTimersByTime(400); c.up(point(130));
    expect(h.onStrokeStart).not.toHaveBeenCalled(); expect(h.onDragEnd).toHaveBeenCalledWith({ dx: 30, dy: 0 });
  });
  it("lock blocks dragging but still permits stroking", () => {
    const { handlers: h, controller: c } = input(); h.locked = true;
    c.down(point()); c.move(point(120)); c.up(point(120)); vi.runAllTimers();
    expect(h.onClick).not.toHaveBeenCalled(); expect(h.onDragStart).not.toHaveBeenCalled();
    c.down(point()); vi.advanceTimersByTime(300); expect(h.onStrokeStart).toHaveBeenCalledOnce();
  });
  it("sleeping head press never starts a stroke; release is still a head click", () => {
    const { handlers: h, controller: c } = input(); h.canStroke = () => false;
    c.down(point()); vi.advanceTimersByTime(800); c.up(point()); vi.runAllTimers();
    expect(h.onStrokeStart).not.toHaveBeenCalled(); expect(h.onClick).toHaveBeenCalledOnce();
  });
  it("double clicks have one response, and distant clicks remain separate", () => {
    const { handlers: h, controller: c } = input();
    c.down(point()); c.up(point()); vi.advanceTimersByTime(80); c.down(point()); c.up(point()); vi.runAllTimers();
    expect(h.onDoubleClick).toHaveBeenCalledOnce(); expect(h.onClick).not.toHaveBeenCalled();
    c.down(point()); c.up(point()); c.down(point(150)); c.up(point(150)); vi.runAllTimers();
    expect(h.onClick).toHaveBeenCalledTimes(2);
  });
  it("cancellation ends a stroke once and discards delayed clicks", () => {
    const { handlers: h, controller: c } = input();
    c.down(point()); vi.advanceTimersByTime(300); c.cancel(); c.cancel(); c.up(point());
    expect(h.onStrokeEnd).toHaveBeenCalledOnce();
    c.down(point()); c.up(point()); c.cancel(); vi.runAllTimers(); expect(h.onClick).not.toHaveBeenCalled();
  });
  it("transparent area has no gesture", () => {
    const { handlers: h, controller: c } = input(); h.targetAt = () => "none";
    expect(c.down(point())).toBe(false); vi.runAllTimers(); expect(h.onStrokeStart).not.toHaveBeenCalled();
  });
  it("losing pointer capture ends a held gesture but normal release keeps its click", () => {
    const { handlers: h, controller: c } = input();
    c.down(point()); vi.advanceTimersByTime(300); c.lostCapture(); expect(h.onStrokeEnd).toHaveBeenCalledOnce();
    c.down(point()); c.up(point()); c.lostCapture(); vi.runAllTimers(); expect(h.onClick).toHaveBeenCalledOnce();
  });
  it("locking during a pending head hold keeps it, but locking during drag ends the drag", () => {
    const { handlers: h, controller: c } = input();
    c.down(point()); h.locked = true; c.lockChanged(); vi.advanceTimersByTime(300); expect(h.onStrokeStart).toHaveBeenCalledOnce(); c.cancel();
    h.locked = false; c.down(point()); c.move(point(120)); h.locked = true; c.lockChanged(); expect(h.onDragEnd).toHaveBeenCalledOnce();
  });
});

describe("stateful reactions", () => {
  it.each([["head", "HeadTouch"], ["cheekLeft", "CheekLeft"], ["cheekRight", "CheekRight"], ["body", "BodyTouch"]] as const)("responds to %s and permits deliberate interruption", (target, action) => {
    const machine = createBehaviorMachine("quiet"); machine.send({ type: "action", action: "Greet" });
    expect(machine.send({ type: "click", target })).toBe(true); expect(machine.snapshot().nextAction).toBe(action);
  });
  it("stroke stays active through idle/hover/completion and a manual sleep cancels it", () => {
    const machine = createBehaviorMachine("active"); machine.send({ type: "hold:start" });
    for (const type of ["idle:tick", "motion:finished", "hover:end"] as const) expect(machine.send({ type })).toBe(false);
    expect(machine.snapshot().state).toBe("stroking"); machine.send({ type: "action", action: "Sleep" });
    expect(machine.send({ type: "hold:end" })).toBe(false); expect(machine.snapshot().state).toBe("sleeping");
  });
  it("maps cheeks inside the head ellipse and rejects outside corners", () => {
    expect(classifyHeadPoint(0, -0.5)).toBe("head"); expect(classifyHeadPoint(-0.5, 0.3)).toBe("cheekLeft");
    expect(classifyHeadPoint(0.5, 0.3)).toBe("cheekRight"); expect(classifyHeadPoint(0.9, 0.9)).toBe("none");
  });
  it("recovers gently offline, handles invalid saves and clock reversal", () => {
    expect(restoreCompanion(null, 100).energy).toBe(75);
    expect(restoreCompanion({ ...state, energy: NaN }, 100).energy).toBe(75);
    expect(restoreCompanion(state, 5 * 60000).energy).toBe(80);
    expect(restoreCompanion({ ...state, updatedAt: 200 }, 100).energy).toBe(70);
    expect(restoreCompanion(state, 1000000000).energy).toBe(100);
  });
  it("sleep restores energy, play consumes it, strokes improve mood, and values stay bounded", () => {
    expect(advanceCompanion(state, 10, "sleeping").energy).toBeGreaterThan(state.energy);
    expect(rewardInteraction(state, "Move").energy).toBeLessThan(state.energy);
    expect(advanceCompanion(state, 10, "stroking").mood).toBeGreaterThan(state.mood);
    expect(advanceCompanion({ ...state, mood: 99, energy: 99 }, 10000, "stroking").mood).toBe(100);
  });
  it("chooses subdued non-repeating activity appropriate to energy", () => {
    expect(chooseIdle({ ...state, energy: 10 }, null, 0)).toBe("Drowsy");
    expect(chooseIdle({ ...state, energy: 10 }, "Drowsy", 0)).toBe("Relax");
    for (const r of [0, 0.4, 0.9]) expect(chooseIdle(state, "Observe", r)).toBe("Relax");
  });
  it("eye tracking leads head tracking without overshoot and strokes follow both directions", () => {
    const eye = approach(0, 1, 0.1, 0.085), head = approach(0, eye, 0.1, 0.24);
    expect(eye).toBeGreaterThan(head); expect(eye).toBeLessThan(1);
    expect(softPose("Stroke", 2, state, -1).ParamAngleZ).toBeLessThan(0);
    expect(softPose("Stroke", 2, state, 1).ParamAngleZ).toBeGreaterThan(0);
    expect(softPose("HeadTouch", 1.35, state, 0).ParamEyeLOpen).toBe(1);
  });
});
