import type { PetActionName } from "./actions.js";
import type { AppConfig } from "./types.js";
export type { PetActionName } from "./actions.js";

export const IPC_CHANNELS = {
  configGet: "config:get",
  configUpdate: "config:update",
  configChanged: "config:changed",
  petBoundsChanged: "pet:bounds:changed",
  petCursorChanged: "pet:cursor:changed",
  petActionTriggered: "pet:action:triggered",
  petActionTrigger: "pet:action:trigger",
  petDragStart: "pet:drag:start",
  petDragMove: "pet:drag:move",
  petDragEnd: "pet:drag:end",
  petPositionPreview: "pet:position:preview",
  petPositionUpdate: "pet:position:update",
  petPositionReset: "pet:position:reset",
  petVisibilitySet: "pet:visibility:set",
  petClickThroughSet: "pet:click-through:set",
  appAutoLaunchSet: "app:auto-launch:set",
  settingsOpen: "settings:open",
  appQuit: "app:quit"
} as const;

export type ConfigPatch = Partial<{
  window: Partial<AppConfig["window"]>;
  pet: Partial<AppConfig["pet"]>;
  ai: Partial<AppConfig["ai"]>;
}>;

export interface XiaoheiBridge {
  config: {
    get(): Promise<AppConfig>;
    update(patch: ConfigPatch): Promise<AppConfig>;
    onChanged(callback: (config: AppConfig) => void): () => void;
  };
  pet: {
    startDrag(): Promise<void>;
    moveDrag(delta: { dx: number; dy: number }): Promise<void>;
    endDrag(delta: { dx: number; dy: number }): Promise<AppConfig>;
    previewPosition(position: { x: number; y: number }): Promise<void>;
    updatePosition(position: { x: number; y: number }): Promise<AppConfig>;
    resetPosition(): Promise<AppConfig>;
    triggerAction(action: PetActionName): Promise<void>;
    onActionTriggered(callback: (action: PetActionName) => void): () => void;
    onBoundsChanged(callback: (bounds: { x: number; y: number; width: number; height: number }) => void): () => void;
    onCursorChanged(
      callback: (payload: {
        cursor: { x: number; y: number };
        bounds: { x: number; y: number; width: number; height: number };
      }) => void
    ): () => void;
    setVisibility(visible: boolean): Promise<AppConfig>;
    setClickThrough(enabled: boolean): Promise<AppConfig>;
  };
  app: {
    setAutoLaunch(enabled: boolean): Promise<AppConfig>;
    openSettings(): Promise<void>;
    quit(): Promise<void>;
  };
}
