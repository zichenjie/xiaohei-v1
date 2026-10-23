import { contextBridge, ipcRenderer } from "electron";
import type { ConfigPatch, XiaoheiBridge } from "../shared/ipc.js";
import type { AppConfig } from "../shared/types.js";

const IPC_CHANNELS = {
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

const bridge: XiaoheiBridge = {
  status: {
    open: () => ipcRenderer.invoke(IPC_CHANNELS.petStatusOpen),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.petStatusClose),
    get: () => ipcRenderer.invoke(IPC_CHANNELS.petStatusGet),
    publish: (status) => ipcRenderer.send(IPC_CHANNELS.petStatusPublish, status),
    onChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, status: Parameters<typeof callback>[0]) => callback(status);
      ipcRenderer.on(IPC_CHANNELS.petStatusChanged, listener);
      return () => ipcRenderer.off(IPC_CHANNELS.petStatusChanged, listener);
    }
  },
  companion: {
    context: () => ipcRenderer.invoke(IPC_CHANNELS.companionContext),
    setBubble: (bubble) => ipcRenderer.invoke(IPC_CHANNELS.companionBubbleSet, bubble),
    getBubble: () => ipcRenderer.invoke(IPC_CHANNELS.companionBubbleGet),
    onBubble: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, bubble: Parameters<typeof callback>[0]) => callback(bubble);
      ipcRenderer.on(IPC_CHANNELS.companionBubbleChanged, listener);
      return () => ipcRenderer.off(IPC_CHANNELS.companionBubbleChanged, listener);
    },
    reply: (reply) => ipcRenderer.invoke(IPC_CHANNELS.companionReply, reply),
    onReply: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, reply: Parameters<typeof callback>[0]) => callback(reply);
      ipcRenderer.on(IPC_CHANNELS.companionReply, listener);
      return () => ipcRenderer.off(IPC_CHANNELS.companionReply, listener);
    }
  },
  config: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.configGet),
    update: (patch: ConfigPatch) => ipcRenderer.invoke(IPC_CHANNELS.configUpdate, patch),
    onChanged: (callback: (config: AppConfig) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, config: AppConfig) => callback(config);
      ipcRenderer.on(IPC_CHANNELS.configChanged, listener);
      return () => ipcRenderer.off(IPC_CHANNELS.configChanged, listener);
    }
  },
  pet: {
    startWalk: (pixelsPerUnit) => ipcRenderer.invoke(IPC_CHANNELS.petWalkStart, pixelsPerUnit),
    stopWalk: () => ipcRenderer.invoke(IPC_CHANNELS.petWalkStop),
    onWalkFrame: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, frame: Parameters<typeof callback>[0]) => callback(frame);
      ipcRenderer.on(IPC_CHANNELS.petWalkFrame, listener);
      return () => ipcRenderer.off(IPC_CHANNELS.petWalkFrame, listener);
    },
    startDrag: () => ipcRenderer.invoke(IPC_CHANNELS.petDragStart),
    moveDrag: (delta) => ipcRenderer.invoke(IPC_CHANNELS.petDragMove, delta),
    endDrag: (delta) => ipcRenderer.invoke(IPC_CHANNELS.petDragEnd, delta),
    previewPosition: (position) => ipcRenderer.invoke(IPC_CHANNELS.petPositionPreview, position),
    updatePosition: (position) => ipcRenderer.invoke(IPC_CHANNELS.petPositionUpdate, position),
    resetPosition: () => ipcRenderer.invoke(IPC_CHANNELS.petPositionReset),
    triggerAction: (action, direction) => ipcRenderer.invoke(IPC_CHANNELS.petActionTrigger, action, direction),
    openActions: () => ipcRenderer.invoke(IPC_CHANNELS.petActionsOpen),
    closeActions: () => ipcRenderer.invoke(IPC_CHANNELS.petActionsClose),
    onActionTriggered: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, action: Parameters<typeof callback>[0]) => callback(action);
      ipcRenderer.on(IPC_CHANNELS.petActionTriggered, listener);
      return () => ipcRenderer.off(IPC_CHANNELS.petActionTriggered, listener);
    },
    onBoundsChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, bounds: Parameters<typeof callback>[0]) => callback(bounds);
      ipcRenderer.on(IPC_CHANNELS.petBoundsChanged, listener);
      return () => ipcRenderer.off(IPC_CHANNELS.petBoundsChanged, listener);
    },
    onCursorChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]) => callback(payload);
      ipcRenderer.on(IPC_CHANNELS.petCursorChanged, listener);
      return () => ipcRenderer.off(IPC_CHANNELS.petCursorChanged, listener);
    },
    setVisibility: (visible) => ipcRenderer.invoke(IPC_CHANNELS.petVisibilitySet, visible),
    setClickThrough: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.petClickThroughSet, enabled)
  },
  app: {
    setAutoLaunch: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.appAutoLaunchSet, enabled),
    openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settingsOpen),
    quit: () => ipcRenderer.invoke(IPC_CHANNELS.appQuit)
  }
};

contextBridge.exposeInMainWorld("xiaohei", bridge);
