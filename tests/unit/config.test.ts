import { describe, expect, it } from "vitest";
import { createDefaultConfig, normalizeConfig } from "../../src/main/config.js";

describe("config", () => {
  it("creates Windows-first default config for the bundled model", () => {
    const config = createDefaultConfig();

    expect(config.window.scale).toBe(1);
    expect(config.window.alwaysOnTop).toBe(true);
    expect(config.window.clickThrough).toBe(false);
    expect(config.window.locked).toBe(false);
    expect(config.window.visible).toBe(true);
    expect(config.pet.behaviorMode).toBe("quiet");
    expect(config.pet.modelPath).toBe("material/罗小黑免费模型/罗小黑免费模型.model3.json");
    expect(config.pet.followMouse).toBe(true);
    expect(config.system.autoLaunch).toBe(false);
    expect(config.ai.enabled).toBe(false);
    expect(config.schemaVersion).toBe(1);
  });

  it("normalizes partial config without trusting invalid values", () => {
    const config = normalizeConfig({
      window: {
        x: Number.POSITIVE_INFINITY,
        y: 120,
        scale: Number.POSITIVE_INFINITY,
        alwaysOnTop: "yes",
        clickThrough: true,
        locked: "no",
        visible: null
      },
      pet: { behaviorMode: "loud", modelPath: "", followMouse: "yes" },
      system: { autoLaunch: "yes" },
      ai: { enabled: true, provider: "openai", model: "gpt" },
      schemaVersion: 999
    });

    expect(config.window.x).toBeNull();
    expect(config.window.y).toBe(120);
    expect(config.window.scale).toBe(1);
    expect(config.window.alwaysOnTop).toBe(true);
    expect(config.window.clickThrough).toBe(true);
    expect(config.window.locked).toBe(false);
    expect(config.window.visible).toBe(true);
    expect(config.pet.behaviorMode).toBe("quiet");
    expect(config.pet.modelPath).toBe("material/罗小黑免费模型/罗小黑免费模型.model3.json");
    expect(config.pet.followMouse).toBe(true);
    expect(config.system.autoLaunch).toBe(false);
    expect(config.ai).toEqual({ enabled: false, provider: "none", model: "" });
    expect(config.schemaVersion).toBe(1);
  });

  it("clamps finite scale values to the supported range", () => {
    expect(normalizeConfig({ window: { scale: 99 } }).window.scale).toBe(2);
    expect(normalizeConfig({ window: { scale: 0.1 } }).window.scale).toBe(0.4);
  });

  it("preserves valid mouse follow preference", () => {
    expect(normalizeConfig({ pet: { followMouse: false } }).pet.followMouse).toBe(false);
    expect(normalizeConfig({ pet: { followMouse: true } }).pet.followMouse).toBe(true);
  });

  it("returns independent default config copies", () => {
    const first = createDefaultConfig();
    const second = createDefaultConfig();

    first.window.scale = 1.5;

    expect(second.window.scale).toBe(1);
  });
});
