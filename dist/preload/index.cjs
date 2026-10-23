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
};
const bridge = {
    status: {
        open: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petStatusOpen),
        close: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petStatusClose),
        get: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petStatusGet),
        publish: (status) => electron_1.ipcRenderer.send(IPC_CHANNELS.petStatusPublish, status),
        onChanged: (callback) => {
            const listener = (_event, status) => callback(status);
            electron_1.ipcRenderer.on(IPC_CHANNELS.petStatusChanged, listener);
            return () => electron_1.ipcRenderer.off(IPC_CHANNELS.petStatusChanged, listener);
        }
    },
    companion: {
        context: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.companionContext),
        setBubble: (bubble) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.companionBubbleSet, bubble),
        getBubble: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.companionBubbleGet),
        onBubble: (callback) => {
            const listener = (_event, bubble) => callback(bubble);
            electron_1.ipcRenderer.on(IPC_CHANNELS.companionBubbleChanged, listener);
            return () => electron_1.ipcRenderer.off(IPC_CHANNELS.companionBubbleChanged, listener);
        },
        reply: (reply) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.companionReply, reply),
        onReply: (callback) => {
            const listener = (_event, reply) => callback(reply);
            electron_1.ipcRenderer.on(IPC_CHANNELS.companionReply, listener);
            return () => electron_1.ipcRenderer.off(IPC_CHANNELS.companionReply, listener);
        }
    },
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
        startWalk: (pixelsPerUnit) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petWalkStart, pixelsPerUnit),
        stopWalk: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petWalkStop),
        onWalkFrame: (callback) => {
            const listener = (_event, frame) => callback(frame);
            electron_1.ipcRenderer.on(IPC_CHANNELS.petWalkFrame, listener);
            return () => electron_1.ipcRenderer.off(IPC_CHANNELS.petWalkFrame, listener);
        },
        startDrag: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petDragStart),
        moveDrag: (delta) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petDragMove, delta),
        endDrag: (delta) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petDragEnd, delta),
        previewPosition: (position) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petPositionPreview, position),
        updatePosition: (position) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petPositionUpdate, position),
        resetPosition: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petPositionReset),
        triggerAction: (action, direction) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petActionTrigger, action, direction),
        openActions: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petActionsOpen),
        closeActions: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.petActionsClose),
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
