"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
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
};
const bridge = {
    config: {
        get: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.configGet),
        update: (patch) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.configUpdate, patch),
        onChanged: (callback) => {
            const listener = (_event, config) => callback(config);
            electron_1.ipcRenderer.on(IPC_CHANNELS.configChanged, listener);
            return () => electron_1.ipcRenderer.off(IPC_CHANNELS.configChanged, listener);
        }
    },
    pet: {
        startDrag: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petDragStart),
        moveDrag: (delta) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petDragMove, delta),
        endDrag: (delta) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petDragEnd, delta),
        previewPosition: (position) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petPositionPreview, position),
        updatePosition: (position) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petPositionUpdate, position),
        resetPosition: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petPositionReset),
        triggerAction: (action) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petActionTrigger, action),
        onActionTriggered: (callback) => {
            const listener = (_event, action) => callback(action);
            electron_1.ipcRenderer.on(IPC_CHANNELS.petActionTriggered, listener);
            return () => electron_1.ipcRenderer.off(IPC_CHANNELS.petActionTriggered, listener);
        },
        onBoundsChanged: (callback) => {
            const listener = (_event, bounds) => callback(bounds);
            electron_1.ipcRenderer.on(IPC_CHANNELS.petBoundsChanged, listener);
            return () => electron_1.ipcRenderer.off(IPC_CHANNELS.petBoundsChanged, listener);
        },
        onCursorChanged: (callback) => {
            const listener = (_event, payload) => callback(payload);
            electron_1.ipcRenderer.on(IPC_CHANNELS.petCursorChanged, listener);
            return () => electron_1.ipcRenderer.off(IPC_CHANNELS.petCursorChanged, listener);
        },
        setVisibility: (visible) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petVisibilitySet, visible),
        setClickThrough: (enabled) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petClickThroughSet, enabled)
    },
    app: {
        setAutoLaunch: (enabled) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.appAutoLaunchSet, enabled),
        openSettings: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.settingsOpen),
        quit: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.appQuit)
    }
};
electron_1.contextBridge.exposeInMainWorld("xiaohei", bridge);
