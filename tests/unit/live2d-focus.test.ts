import { afterEach, describe, expect, it, vi } from "vitest";
import { createLive2DAdapter } from "../../src/renderer/pet/live2d/Live2DAdapter.js";

const { focus, model, manager, loops } = vi.hoisted(() => {
  const focus = vi.fn();
  const listeners = new Set<() => void>();
  const loops = new Map<string, boolean>();
  const manager = {
    loadMotion: vi.fn(async (group: string) => ({ setIsLoop: (loop: boolean) => loops.set(group, loop), getLoopDuration: () => 1.8 })),
    stopAllMotions: vi.fn(),
    on: vi.fn((_event: string, callback: () => void) => listeners.add(callback)),
    off: vi.fn((_event: string, callback: () => void) => listeners.delete(callback)),
    finish: () => { for (const callback of [...listeners]) callback(); }
  };
  return {
    focus,
    manager,
    loops,
    model: {
      width: 100,
      height: 100,
      scale: { set: vi.fn() },
      anchor: { set: vi.fn() },
      position: { set: vi.fn() },
      motion: vi.fn().mockResolvedValue(true),
      internalModel: {
        focusController: { focus }, motionManager: manager,
        breath: { setParameters: vi.fn() },
        coreModel: {
          getParameterCount: () => 4,
          getParameterDefaultValue: (index: number) => [1, 1, 0, 0][index],
          setParameterValueByIndex: vi.fn(),
          saveParameters: vi.fn()
        }
      }
    }
  };
});

async function loadAdapter() {
  vi.stubGlobal("window", {
    location: { protocol: "file:" }, devicePixelRatio: 1,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now() + 10000), 0),
    cancelAnimationFrame: clearTimeout
  });
  const adapter = createLive2DAdapter();
  await adapter.load("pet.model3.json", { clientWidth: 360, clientHeight: 520 } as HTMLCanvasElement);
  return adapter;
}

vi.mock("pixi.js", () => ({
  Ticker: {},
  Application: class {
    stage = { addChild: vi.fn() };
    renderer = { resize: vi.fn() };
    destroy = vi.fn();
  }
}));

vi.mock("pixi-live2d-display/cubism4", () => ({
  Live2DModel: { registerTicker: vi.fn(), from: vi.fn().mockResolvedValue(model) },
  MotionPriority: { IDLE: 1, FORCE: 3 },
  MotionPreloadStrategy: { ALL: "ALL" }
}));

vi.mock("@pixi/unsafe-eval", () => ({ install: vi.fn() }));

afterEach(() => {
  loops.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Live2D gaze", () => {
  it("holds gaze neutral during a gesture and restores the latest cursor position afterwards", async () => {
    const adapter = await loadAdapter();
    const playing = adapter.playMotion("Greet");
    await vi.waitFor(() => expect(loops.get("Greet")).toBe(false));
    adapter.focus({ x: 0, y: 1 });
    expect(focus).toHaveBeenLastCalledWith(0, 0, true);
    manager.finish();
    expect(await playing).toBe(true);
    expect(focus).toHaveBeenLastCalledWith(-1, -1, true);
    adapter.dispose();
  });
  it("keeps breathing from rotating the head when gaze is neutral", async () => {
    const adapter = await loadAdapter();
    const [parameters] = model.internalModel.breath.setParameters.mock.lastCall!;
    expect(parameters.map((parameter: { parameterId: string }) => parameter.parameterId)).toEqual(["ParamBreath"]);
    adapter.dispose();
  });
  it("returns the controller to neutral after following the mouse, including after resizing", async () => {
    vi.stubGlobal("window", { location: { protocol: "file:" }, devicePixelRatio: 1 });
    const adapter = createLive2DAdapter();
    await adapter.load("pet.model3.json", {
      clientWidth: 360, clientHeight: 520
    } as HTMLCanvasElement);

    adapter.focus({ x: 1, y: 0 }, { instant: true });
    expect(focus).toHaveBeenLastCalledWith(1, 1, true);
    adapter.focus({ x: 0.5, y: 0.5 }, { instant: true });
    expect(focus).toHaveBeenLastCalledWith(0, 0, true);
    adapter.resize(720, 1040);
    adapter.focus({ x: 0.5, y: 0.5 }, { instant: true });
    expect(focus).toHaveBeenLastCalledWith(0, 0, true);
    adapter.dispose();
  });
});

describe("Live2D motion completion", () => {
  it("waits for actual playback completion and plays transient loops only once", async () => {
    const adapter = await loadAdapter();
    let settled = false;
    const playing = adapter.playMotion("Bounce").then((completed) => { settled = true; return completed; });
    await vi.waitFor(() => expect(loops.get("Bounce")).toBe(false));
    expect(settled).toBe(false);
    manager.finish();
    expect(await playing).toBe(true);
    adapter.dispose();
  });

  it("cancels the old completion when sleep interrupts an action", async () => {
    const adapter = await loadAdapter();
    const playing = adapter.playMotion("Happy");
    await vi.waitFor(() => expect(loops.get("Happy")).toBe(false));
    expect(await adapter.playMotion("Sleep")).toBe(true);
    expect(await playing).toBe(false);
    expect(loops.get("Sleep")).toBe(true);
    manager.finish();
    expect(model.motion).toHaveBeenLastCalledWith("Sleep", 0, 3);
    adapter.dispose();
  });

  it("restores and saves neutral pose on interruption and completion", async () => {
    const adapter = await loadAdapter();
    const playing = adapter.playMotion("Pat");
    await vi.waitFor(() => expect(loops.get("Pat")).toBe(false));
    model.internalModel.coreModel.setParameterValueByIndex.mockClear();
    manager.finish();
    expect(await playing).toBe(true);
    expect(model.internalModel.coreModel.setParameterValueByIndex.mock.calls).toEqual([[0, 1], [1, 1], [2, 0], [3, 0]]);
    model.internalModel.coreModel.setParameterValueByIndex.mockClear();
    await adapter.playMotion("Idle");
    expect(model.internalModel.coreModel.setParameterValueByIndex.mock.calls).toEqual([[0, 1], [1, 1], [2, 0], [3, 0]]);
    expect(model.internalModel.coreModel.saveParameters).toHaveBeenCalled();
    adapter.dispose();
  });
});
