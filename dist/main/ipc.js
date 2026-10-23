import { BrowserWindow, app, ipcMain } from "electron";
import { isPetActionName } from "../shared/actions.js";
import { IPC_CHANNELS } from "../shared/ipc.js";
import { loadConfig, updateConfig } from "./config.js";
import { isPetStatus } from "../shared/status.js";
import { setAutoLaunch } from "./autostart.js";
import { refreshTrayMenu } from "./tray.js";
import { applyPetWindowConfig, createPetWindow, getPetWindow, cancelPetActionMove, movePetWindowForAction, ensurePetWalkDirectionAvailable, hideActionsWindow, openActionsWindow, openStatusWindow, closeStatusWindow, publishPetStatus, getPetStatus, movePetWindowBy, previewPetWindowPosition, resetPetWindowPosition, settlePetWindowDrag, settlePetWindowPosition, startPetWindowDrag } from "./windows.js";
function broadcastConfigChanged(config = loadConfig()) {
    for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(IPC_CHANNELS.configChanged, config);
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function finiteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function positionPatch(position) {
    const source = isRecord(position) ? position : {};
    const patch = {};
    const x = finiteNumber(source.x);
    const y = finiteNumber(source.y);
    if (x !== undefined) {
        patch.x = x;
    }
    if (y !== undefined) {
        patch.y = y;
    }
    return patch;
}
function deltaPatch(delta) {
    const source = isRecord(delta) ? delta : {};
    const patch = {};
    const dx = finiteNumber(source.dx);
    const dy = finiteNumber(source.dy);
    if (dx !== undefined) {
        patch.dx = dx;
    }
    if (dy !== undefined) {
        patch.dy = dy;
    }
    return patch;
}
function configPatch(patch) {
    const source = isRecord(patch) ? patch : {};
    const result = {};
    if (isRecord(source.window)) {
        const windowPatch = {};
        if (typeof source.window.x === "number" && Number.isFinite(source.window.x)) {
            windowPatch.x = source.window.x;
        }
        if (typeof source.window.y === "number" && Number.isFinite(source.window.y)) {
            windowPatch.y = source.window.y;
        }
        if (typeof source.window.scale === "number" && Number.isFinite(source.window.scale)) {
            windowPatch.scale = source.window.scale;
        }
        if (typeof source.window.alwaysOnTop === "boolean") {
            windowPatch.alwaysOnTop = source.window.alwaysOnTop;
        }
        if (typeof source.window.clickThrough === "boolean") {
            windowPatch.clickThrough = source.window.clickThrough;
        }
        if (typeof source.window.locked === "boolean") {
            windowPatch.locked = source.window.locked;
        }
        if (typeof source.window.visible === "boolean") {
            windowPatch.visible = source.window.visible;
        }
        result.window = windowPatch;
    }
    if (isRecord(source.pet)) {
        const petPatch = {};
        if (source.pet.behaviorMode === "quiet" || source.pet.behaviorMode === "active") {
            petPatch.behaviorMode = source.pet.behaviorMode;
        }
        if (typeof source.pet.modelPath === "string" && source.pet.modelPath.length > 0) {
            petPatch.modelPath = source.pet.modelPath;
        }
        if (typeof source.pet.followMouse === "boolean") {
            petPatch.followMouse = source.pet.followMouse;
        }
        if (["quiet", "balanced", "active"].includes(String(source.pet.initiative))) {
            petPatch.initiative = source.pet.initiative;
        }
        if (typeof source.pet.autoRest === "boolean")
            petPatch.autoRest = source.pet.autoRest;
        if (typeof source.pet.quietUntil === "number" && Number.isFinite(source.pet.quietUntil))
            petPatch.quietUntil = source.pet.quietUntil;
        result.pet = petPatch;
    }
    if (isRecord(source.ai)) {
        result.ai = {
            enabled: false,
            provider: "none",
            model: ""
        };
    }
    return result;
}
function applyConfigSideEffects(config) {
    applyPetWindowConfig();
    refreshTrayMenu();
    broadcastConfigChanged(config);
    return config;
}
export function registerIpcHandlers(openSettings) {
    let requestedWalkDirection;
    ipcMain.handle(IPC_CHANNELS.petStatusOpen, () => openStatusWindow());
    ipcMain.handle(IPC_CHANNELS.petStatusClose, () => closeStatusWindow());
    ipcMain.handle(IPC_CHANNELS.petStatusGet, () => getPetStatus());
    ipcMain.on(IPC_CHANNELS.petStatusPublish, (event, status) => {
        if (event.sender === getPetWindow()?.webContents && isPetStatus(status))
            publishPetStatus(status);
    });
    ipcMain.handle(IPC_CHANNELS.configGet, () => loadConfig());
    ipcMain.handle(IPC_CHANNELS.configUpdate, (_event, patch) => {
        const config = updateConfig(configPatch(patch));
        return applyConfigSideEffects(config);
    });
    ipcMain.handle(IPC_CHANNELS.petActionTrigger, async (_event, action, direction) => {
        if (!isPetActionName(action)) {
            return;
        }
        if (direction !== undefined && (action !== "Move" || (direction !== "left" && direction !== "right"))) {
            throw new Error("移动方向无效");
        }
        const petWindow = getPetWindow() ?? (await createPetWindow());
        if (action === "Move" && direction)
            ensurePetWalkDirectionAvailable(direction);
        requestedWalkDirection = action === "Move" ? direction : undefined;
        cancelPetActionMove();
        if (action === "Move") {
            if (loadConfig().window.locked)
                return;
        }
        console.log(`[main] trigger pet action: ${action}`);
        petWindow.webContents.send(IPC_CHANNELS.petActionTriggered, action);
        hideActionsWindow();
    });
    ipcMain.handle(IPC_CHANNELS.petWalkStart, (event, pixelsPerUnit) => {
        if (event.sender !== getPetWindow()?.webContents)
            return;
        if (typeof pixelsPerUnit !== "number" || !Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0 || pixelsPerUnit > 10000)
            return;
        const direction = requestedWalkDirection;
        requestedWalkDirection = undefined;
        movePetWindowForAction(pixelsPerUnit, direction);
    });
    ipcMain.handle(IPC_CHANNELS.petWalkStop, (event) => {
        if (event.sender === getPetWindow()?.webContents)
            cancelPetActionMove();
    });
    ipcMain.handle(IPC_CHANNELS.petActionsOpen, async () => { await openActionsWindow(); });
    ipcMain.handle(IPC_CHANNELS.petActionsClose, () => hideActionsWindow());
    ipcMain.handle(IPC_CHANNELS.petDragStart, () => {
        startPetWindowDrag();
    });
    ipcMain.handle(IPC_CHANNELS.petDragMove, (_event, delta) => {
        movePetWindowBy(deltaPatch(delta));
    });
    ipcMain.handle(IPC_CHANNELS.petDragEnd, (_event, delta) => {
        const config = settlePetWindowDrag(deltaPatch(delta));
        refreshTrayMenu();
        broadcastConfigChanged(config);
        return config;
    });
    ipcMain.handle(IPC_CHANNELS.petPositionPreview, (_event, position) => {
        previewPetWindowPosition(positionPatch(position));
    });
    ipcMain.handle(IPC_CHANNELS.petPositionUpdate, (_event, position) => {
        const config = settlePetWindowPosition(positionPatch(position));
        refreshTrayMenu();
        broadcastConfigChanged(config);
        return config;
    });
    ipcMain.handle(IPC_CHANNELS.petPositionReset, () => {
        const config = resetPetWindowPosition();
        return applyConfigSideEffects(config);
    });
    ipcMain.handle(IPC_CHANNELS.petVisibilitySet, (_event, visible) => {
        const config = updateConfig({ window: typeof visible === "boolean" ? { visible } : {} });
        return applyConfigSideEffects(config);
    });
    ipcMain.handle(IPC_CHANNELS.petClickThroughSet, (_event, clickThrough) => {
        const config = updateConfig({ window: typeof clickThrough === "boolean" ? { clickThrough } : {} });
        return applyConfigSideEffects(config);
    });
    ipcMain.handle(IPC_CHANNELS.appAutoLaunchSet, (_event, autoLaunch) => {
        const requested = typeof autoLaunch === "boolean" ? autoLaunch : loadConfig().system.autoLaunch;
        const result = setAutoLaunch(requested);
        const config = result.success ? updateConfig({ system: { autoLaunch: result.enabled } }) : loadConfig();
        return applyConfigSideEffects(config);
    });
    ipcMain.handle(IPC_CHANNELS.settingsOpen, async () => {
        await openSettings();
    });
    ipcMain.handle(IPC_CHANNELS.appQuit, () => app.quit());
}
