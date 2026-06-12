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

const bridge: XiaoheiBridge = {
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
    startDrag: () => ipcRenderer.invoke(IPC_CHANNELS.petDragStart),
    moveDrag: (delta) => ipcRenderer.invoke(IPC_CHANNELS.petDragMove, delta),
    endDrag: (delta) => ipcRenderer.invoke(IPC_CHANNELS.petDragEnd, delta),
    previewPosition: (position) => ipcRenderer.invoke(IPC_CHANNELS.petPositionPreview, position),
    updatePosition: (position) => ipcRenderer.invoke(IPC_CHANNELS.petPositionUpdate, position),
    resetPosition: () => ipcRenderer.invoke(IPC_CHANNELS.petPositionReset),
    triggerAction: (action) => ipcRenderer.invoke(IPC_CHANNELS.petActionTrigger, action),
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
