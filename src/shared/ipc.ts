import type { PetActionName } from "./actions.js";
import type { AppConfig } from "./types.js";
import type { WalkDirection, WalkFrame } from "./walk.js";
import type { CompanionContext, CompanionBubble, CompanionReply } from "./companion.js";
import type { PetStatus } from "./status.js";
export type { PetActionName } from "./actions.js";

export const IPC_CHANNELS = {
  configGet: "config:get",
  configUpdate: "config:update",
  configChanged: "config:changed",
  petBoundsChanged: "pet:bounds:changed",
  petCursorChanged: "pet:cursor:changed",
  petActionTriggered: "pet:action:triggered",
  petActionTrigger: "pet:action:trigger",
  petWalkStart: "pet:walk:start",
  petWalkFrame: "pet:walk:frame",
  petWalkStop: "pet:walk:stop",
  petActionsOpen: "pet:actions:open",
  petActionsClose: "pet:actions:close",
  petStatusOpen: "pet:status:open",
  petStatusClose: "pet:status:close",
  petStatusGet: "pet:status:get",
  petStatusPublish: "pet:status:publish",
  petStatusChanged: "pet:status:changed",
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
  appQuit: "app:quit",
  companionContext: "companion:context",
  companionBubbleSet: "companion:bubble:set",
  companionBubbleGet: "companion:bubble:get",
  companionBubbleChanged: "companion:bubble:changed",
  companionReply: "companion:reply"
} as const;

export type ConfigPatch = Partial<{
  window: Partial<AppConfig["window"]>;
  pet: Partial<AppConfig["pet"]>;
  ai: Partial<AppConfig["ai"]>;
}>;

export interface XiaoheiBridge {
  status: {
    open(): Promise<void>;
    close(): Promise<void>;
    get(): Promise<PetStatus | null>;
    publish(status: PetStatus): void;
    onChanged(callback: (status: PetStatus) => void): () => void;
  };
  companion: {
    context(): Promise<CompanionContext>;
    setBubble(bubble: CompanionBubble | null): Promise<boolean>;
    getBubble(): Promise<CompanionBubble | null>;
    onBubble(callback: (bubble: CompanionBubble | null) => void): () => void;
    reply(reply: CompanionReply): Promise<void>;
    onReply(callback: (reply: CompanionReply) => void): () => void;
  };
  config: {
    get(): Promise<AppConfig>;
    update(patch: ConfigPatch): Promise<AppConfig>;
    onChanged(callback: (config: AppConfig) => void): () => void;
  };
  pet: {
    startWalk(pixelsPerUnit: number): Promise<void>;
    stopWalk(): Promise<void>;
    onWalkFrame(callback: (frame: WalkFrame) => void): () => void;
    startDrag(): Promise<void>;
    moveDrag(delta: { dx: number; dy: number }): Promise<void>;
    endDrag(delta: { dx: number; dy: number }): Promise<AppConfig>;
    previewPosition(position: { x: number; y: number }): Promise<void>;
    updatePosition(position: { x: number; y: number }): Promise<AppConfig>;
    resetPosition(): Promise<AppConfig>;
    triggerAction(action: PetActionName, direction?: WalkDirection): Promise<void>;
    openActions(): Promise<void>;
    closeActions(): Promise<void>;
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
