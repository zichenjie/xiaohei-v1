import Store from "electron-store";
import { DEFAULT_CONFIG } from "../shared/defaults.js";
import { resolveResourcePath } from "./resources.js";
let store = null;
function getStore() {
    store ??= new Store({ name: "config" });
    return store;
}
function loadStoredConfig() {
    return normalizeConfig(getStore().get("config"));
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function isBehaviorMode(value) {
    return value === "quiet" || value === "active";
}
function clampScale(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return DEFAULT_CONFIG.window.scale;
    }
    return Math.min(2, Math.max(0.4, value));
}
function numberOrNull(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}
export function createDefaultConfig() {
    return structuredClone(DEFAULT_CONFIG);
}
function toRuntimeConfig(config) {
    const defaultRuntimeModelPath = resolveResourcePath(DEFAULT_CONFIG.pet.modelPath);
    return {
        ...config,
        pet: {
            ...config.pet,
            modelPath: config.pet.modelPath === DEFAULT_CONFIG.pet.modelPath || config.pet.modelPath === defaultRuntimeModelPath
                ? defaultRuntimeModelPath
                : config.pet.modelPath
        }
    };
}
export function normalizeConfig(input) {
    const source = isRecord(input) ? input : {};
    return {
        window: {
            x: numberOrNull(source.window?.x),
            y: numberOrNull(source.window?.y),
            scale: clampScale(source.window?.scale),
            alwaysOnTop: typeof source.window?.alwaysOnTop === "boolean"
                ? source.window.alwaysOnTop
                : DEFAULT_CONFIG.window.alwaysOnTop,
            clickThrough: typeof source.window?.clickThrough === "boolean"
                ? source.window.clickThrough
                : DEFAULT_CONFIG.window.clickThrough,
            locked: typeof source.window?.locked === "boolean" ? source.window.locked : DEFAULT_CONFIG.window.locked,
            visible: typeof source.window?.visible === "boolean" ? source.window.visible : DEFAULT_CONFIG.window.visible
        },
        pet: {
            behaviorMode: isBehaviorMode(source.pet?.behaviorMode)
                ? source.pet.behaviorMode
                : DEFAULT_CONFIG.pet.behaviorMode,
            modelPath: typeof source.pet?.modelPath === "string" && source.pet.modelPath.length > 0
                ? source.pet.modelPath
                : DEFAULT_CONFIG.pet.modelPath,
            followMouse: typeof source.pet?.followMouse === "boolean" ? source.pet.followMouse : DEFAULT_CONFIG.pet.followMouse,
            initiative: ["quiet", "balanced", "active"].includes(source.pet?.initiative ?? "") ? source.pet.initiative : DEFAULT_CONFIG.pet.initiative,
            autoRest: typeof source.pet?.autoRest === "boolean" ? source.pet.autoRest : DEFAULT_CONFIG.pet.autoRest,
            quietUntil: typeof source.pet?.quietUntil === "number" && Number.isFinite(source.pet.quietUntil)
                ? Math.max(0, Math.min(Date.now() + 3600000, source.pet.quietUntil)) : 0
        },
        system: {
            autoLaunch: typeof source.system?.autoLaunch === "boolean"
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
export function loadConfig() {
    const raw = getStore().get("config");
    const normalized = normalizeConfig(raw);
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
        getStore().set("config", normalized);
    }
    return toRuntimeConfig(normalized);
}
export function saveConfig(config) {
    const defaultRuntimeModelPath = resolveResourcePath(DEFAULT_CONFIG.pet.modelPath);
    const storageInput = config.pet.modelPath === defaultRuntimeModelPath
        ? { ...config, pet: { ...config.pet, modelPath: DEFAULT_CONFIG.pet.modelPath } }
        : config;
    const normalized = normalizeConfig(storageInput);
    getStore().set("config", normalized);
    return toRuntimeConfig(normalized);
}
export function updateConfig(patch) {
    const current = loadStoredConfig();
    const safePatch = isRecord(patch) ? patch : {};
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
