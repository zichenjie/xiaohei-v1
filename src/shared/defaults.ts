import type { AppConfig } from "./types.js";

export const DEFAULT_MODEL_PATH = "material/罗小黑免费模型/罗小黑免费模型.model3.json";
export const CONFIG_SCHEMA_VERSION = 1;

export const DEFAULT_CONFIG: AppConfig = {
  window: {
    x: null,
    y: null,
    scale: 1,
    alwaysOnTop: true,
    clickThrough: false,
    locked: false,
    visible: true
  },
  pet: {
    behaviorMode: "quiet",
    modelPath: DEFAULT_MODEL_PATH,
    followMouse: true
  },
  system: {
    autoLaunch: false
  },
  ai: {
    enabled: false,
    provider: "none",
    model: ""
  },
  schemaVersion: CONFIG_SCHEMA_VERSION
};
