import Store from "electron-store";
import { DEFAULT_CONFIG } from "../shared/defaults.js";
import type { AppConfig, BehaviorMode } from "../shared/types.js";
import { resolveResourcePath } from "./resources.js";

type PartialDeep<T> = {
  [K in keyof T]?: T[K] extends object ? PartialDeep<T[K]> : T[K];
};

let store: Store<{ config: AppConfig }> | null = null;

function getStore(): Store<{ config: AppConfig }> {
  store ??= new Store<{ config: AppConfig }>({ name: "config" });
  return store;
}

function loadStoredConfig(): AppConfig {
  return normalizeConfig(getStore().get("config"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBehaviorMode(value: unknown): value is BehaviorMode {
  return value === "quiet" || value === "active";
}

function clampScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CONFIG.window.scale;
  }

  return Math.min(2, Math.max(0.4, value));
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function createDefaultConfig(): AppConfig {
  return structuredClone(DEFAULT_CONFIG);
}

function toRuntimeConfig(config: AppConfig): AppConfig {
  const defaultRuntimeModelPath = resolveResourcePath(DEFAULT_CONFIG.pet.modelPath);

  return {
    ...config,
    pet: {
      ...config.pet,
      modelPath:
        config.pet.modelPath === DEFAULT_CONFIG.pet.modelPath || config.pet.modelPath === defaultRuntimeModelPath
          ? defaultRuntimeModelPath
          : config.pet.modelPath
    }
  };
}

export function normalizeConfig(input: PartialDeep<AppConfig> | unknown): AppConfig {
  const source = isRecord(input) ? (input as PartialDeep<AppConfig>) : {};

  return {
    window: {
      x: numberOrNull(source.window?.x),
      y: numberOrNull(source.window?.y),
      scale: clampScale(source.window?.scale),
      alwaysOnTop:
        typeof source.window?.alwaysOnTop === "boolean"
          ? source.window.alwaysOnTop
          : DEFAULT_CONFIG.window.alwaysOnTop,
      clickThrough:
        typeof source.window?.clickThrough === "boolean"
          ? source.window.clickThrough
          : DEFAULT_CONFIG.window.clickThrough,
      locked: typeof source.window?.locked === "boolean" ? source.window.locked : DEFAULT_CONFIG.window.locked,
      visible: typeof source.window?.visible === "boolean" ? source.window.visible : DEFAULT_CONFIG.window.visible
    },
    pet: {
      behaviorMode: isBehaviorMode(source.pet?.behaviorMode)
        ? source.pet.behaviorMode
        : DEFAULT_CONFIG.pet.behaviorMode,
      modelPath:
        typeof source.pet?.modelPath === "string" && source.pet.modelPath.length > 0
          ? source.pet.modelPath
          : DEFAULT_CONFIG.pet.modelPath,
      followMouse:
        typeof source.pet?.followMouse === "boolean" ? source.pet.followMouse : DEFAULT_CONFIG.pet.followMouse
    },
    system: {
      autoLaunch:
        typeof source.system?.autoLaunch === "boolean"
          ? source.system.autoLaunch
          : DEFAULT_CONFIG.system.autoLaunch
    },
    ai: {
      enabled: false,
      provider: "none",
      model: ""
    },
    schemaVersion: DEFAULT_CONFIG.schemaVersion
  };
}

export function loadConfig(): AppConfig {
  const raw = getStore().get("config");
  const normalized = normalizeConfig(raw);

  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    getStore().set("config", normalized);
  }

  return toRuntimeConfig(normalized);
}

export function saveConfig(config: AppConfig): AppConfig {
  const defaultRuntimeModelPath = resolveResourcePath(DEFAULT_CONFIG.pet.modelPath);
  const storageInput =
    config.pet.modelPath === defaultRuntimeModelPath
      ? { ...config, pet: { ...config.pet, modelPath: DEFAULT_CONFIG.pet.modelPath } }
      : config;
  const normalized = normalizeConfig(storageInput);
  getStore().set("config", normalized);
  return toRuntimeConfig(normalized);
}

export function updateConfig(patch: PartialDeep<AppConfig> | unknown): AppConfig {
  const current = loadStoredConfig();
  const safePatch = isRecord(patch) ? (patch as PartialDeep<AppConfig>) : {};
  const next = normalizeConfig({
    ...current,
    ...safePatch,
    window: { ...current.window, ...safePatch.window },
    pet: { ...current.pet, ...safePatch.pet },
    system: { ...current.system, ...safePatch.system },
    ai: { ...current.ai, ...safePatch.ai }
  });

  return saveConfig(next);
}
