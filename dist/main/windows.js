import { BrowserWindow, Menu, app, nativeImage, screen } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, updateConfig } from "./config.js";
import { resolveResourcePath } from "./resources.js";
import { IPC_CHANNELS } from "../shared/ipc.js";
import { WALK_DURATION_MS, WALK_STEPS, WALK_STRIDE_UNITS, walkTravel } from "../shared/walk.js";
import { hideCompanionBubble, positionCompanionBubble } from "./companion.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
let petWindow = null;
let settingsWindow = null;
let actionsWindow = null;
let actionsWindowReady = null;
let applyingPetBounds = false;
let dragStartBounds = null;
let lockedPetSize = null;
let cursorTimer = null;
let actionMoveTimer = null;
let contextMenuOpen = false;
let statusWindow = null;
let statusWindowReady = null;
let petStatus = null;
export function isCompanionUiBusy() {
    return contextMenuOpen || !!settingsWindow?.isVisible() || !!actionsWindow?.isVisible() || !!statusWindow?.isVisible();
}
function rendererUrl(page) {
    const devServerArg = process.argv.find((arg) => arg.startsWith("--dev-server-url="));
    const devServerUrl = devServerArg?.slice("--dev-server-url=".length) ?? process.env.VITE_DEV_SERVER_URL;
    if (!devServerUrl) {
        return null;
    }
    return page === "pet" ? devServerUrl : `${devServerUrl}/${page}.html`;
}
function preloadPath() {
    return join(__dirname, "../preload/index.cjs");
}
function forwardRendererConsole(window, name) {
    window.webContents.on("console-message", (details) => {
        console.log(`[renderer:${name}:${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`);
    });
    window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
        console.error(`[renderer:${name}] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
    });
    window.webContents.on("render-process-gone", (_event, details) => {
        console.error(`[renderer:${name}] render process gone`, details);
    });
}
function appIcon() {
    return nativeImage.createFromPath(resolveResourcePath("assets/icon.ico"));
}
function emitPetBounds(reason) {
    const window = getPetWindow();
    if (!window || window.webContents.isDestroyed()) {
        return;
    }
    const bounds = window.getBounds();
    window.webContents.send(IPC_CHANNELS.petBoundsChanged, bounds);
    positionCompanionBubble();
    if (actionsWindow && !actionsWindow.isDestroyed() && actionsWindow.isVisible()) {
        positionActionsWindow(actionsWindow, window);
    }
}
function emitPetCursor() {
    const window = getPetWindow();
    if (!window || window.webContents.isDestroyed()) {
        return;
    }
    window.webContents.send(IPC_CHANNELS.petCursorChanged, {
        cursor: screen.getCursorScreenPoint(),
        bounds: window.getBounds()
    });
}
function petSize(scale) {
    return {
        width: Math.round(360 * scale),
        height: Math.round(520 * scale)
    };
}
function displayForBounds(bounds) {
    const center = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2
    };
    return screen.getDisplayNearestPoint(center);
}
function clampBounds(bounds) {
    const { workArea, bounds: displayBounds, scaleFactor } = displayForBounds(bounds);
    const maxX = workArea.x + workArea.width - bounds.width;
    const maxY = workArea.y + workArea.height - bounds.height;
    // Align the origin to physical pixels. Fractional DIP origins otherwise make
    // Windows report an extra pixel at 125%/150% DPI and can grow on each move.
    let step = 1;
    while (step < 16 && Math.abs(step * scaleFactor - Math.round(step * scaleFactor)) > 0.0001)
        step++;
    const align = (value, origin, min, max) => {
        const first = origin + Math.ceil((min - origin) / step) * step;
        const last = origin + Math.floor((max - origin) / step) * step;
        return Math.min(Math.max(origin + Math.round((value - origin) / step) * step, first), Math.max(first, last));
    };
    return {
        ...bounds,
        x: align(bounds.x, displayBounds.x, workArea.x, maxX),
        y: align(bounds.y, displayBounds.y, workArea.y, maxY)
    };
}
function snapBounds(bounds) {
    const clamped = clampBounds(bounds);
    const { workArea } = displayForBounds(clamped);
    const distances = [
        { edge: "left", value: Math.abs(clamped.x - workArea.x) },
        { edge: "right", value: Math.abs(workArea.x + workArea.width - (clamped.x + clamped.width)) },
        { edge: "top", value: Math.abs(clamped.y - workArea.y) },
        { edge: "bottom", value: Math.abs(workArea.y + workArea.height - (clamped.y + clamped.height)) }
    ];
    const nearest = distances.reduce((best, next) => (next.value < best.value ? next : best));
    switch (nearest.edge) {
        case "left":
            return { ...clamped, x: workArea.x };
        case "right":
            return { ...clamped, x: workArea.x + workArea.width - clamped.width };
        case "top":
            return { ...clamped, y: workArea.y };
        case "bottom":
            return { ...clamped, y: workArea.y + workArea.height - clamped.height };
    }
}
function defaultPetBounds(scale = loadConfig().window.scale) {
    const display = screen.getPrimaryDisplay();
    const size = petSize(scale);
    return {
        ...size,
        x: display.workArea.x + display.workArea.width - size.width - 80,
        y: display.workArea.y + display.workArea.height - size.height - 80
    };
}
function lockPetWindowSize(window, size = expectedPetSize()) {
    lockedPetSize = size;
    // Resizability is fixed at construction. Reapplying native styles during
    // every move can repaint non-client chrome on transparent Windows windows.
}
function setPetBounds(bounds) {
    const window = getPetWindow();
    if (!window) {
        return;
    }
    applyingPetBounds = true;
    const aligned = clampBounds(bounds);
    window.setBounds(aligned);
    lockPetWindowSize(window, { width: bounds.width, height: bounds.height });
    emitPetBounds("set-bounds");
    setTimeout(() => {
        applyingPetBounds = false;
    }, 0);
}
function setPetPosition(x, y) {
    const window = getPetWindow();
    if (!window) {
        return;
    }
    applyingPetBounds = true;
    const size = expectedLockedPetSize();
    lockPetWindowSize(window, size);
    const position = clampBounds({ x, y, ...size });
    window.setPosition(position.x, position.y);
    emitPetBounds("set-position");
    setTimeout(() => {
        applyingPetBounds = false;
    }, 0);
}
function expectedPetSize() {
    return petSize(loadConfig().window.scale);
}
function expectedLockedPetSize() {
    return lockedPetSize ?? expectedPetSize();
}
function enforcePetSize(reason) {
    const window = getPetWindow();
    if (!window) {
        return null;
    }
    const bounds = window.getBounds();
    const size = expectedLockedPetSize();
    const [contentWidth, contentHeight] = window.getContentSize();
    if (contentWidth === size.width && contentHeight === size.height) {
        return bounds;
    }
    const nextBounds = clampBounds({ ...bounds, ...size });
    console.log(`[main] corrected pet size after ${reason}: ${bounds.width}x${bounds.height} -> ${nextBounds.width}x${nextBounds.height}`);
    setPetBounds(nextBounds);
    return nextBounds;
}
export async function createPetWindow() {
    if (petWindow && !petWindow.isDestroyed()) {
        return petWindow;
    }
    const config = loadConfig();
    const defaultBounds = defaultPetBounds(config.window.scale);
    const initialBounds = clampBounds({
        ...defaultBounds,
        x: config.window.x ?? defaultBounds.x,
        y: config.window.y ?? defaultBounds.y
    });
    petWindow = new BrowserWindow({
        ...initialBounds,
        title: "",
        transparent: true,
        frame: false,
        thickFrame: false,
        hasShadow: false,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: config.window.alwaysOnTop,
        show: config.window.visible,
        icon: appIcon(),
        webPreferences: {
            preload: preloadPath(),
            backgroundThrottling: false,
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    petWindow.setMenu(null);
    petWindow.on("page-title-updated", (event) => event.preventDefault());
    forwardRendererConsole(petWindow, "pet");
    lockPetWindowSize(petWindow, { width: initialBounds.width, height: initialBounds.height });
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    petWindow.setIgnoreMouseEvents(config.window.clickThrough, { forward: true });
    cursorTimer = setInterval(emitPetCursor, 50);
    petWindow.on("moved", () => {
        if (applyingPetBounds) {
            return;
        }
        const bounds = enforcePetSize("move") ?? petWindow?.getBounds();
        if (bounds) {
            emitPetBounds("moved");
            updateConfig({ window: { x: bounds.x, y: bounds.y } });
        }
    });
    petWindow.on("will-resize", (event) => {
        if (!applyingPetBounds) {
            event.preventDefault();
            enforcePetSize("will-resize");
        }
    });
    petWindow.on("resized", () => {
        if (applyingPetBounds) {
            return;
        }
        enforcePetSize("resize");
        emitPetBounds("resized");
    });
    petWindow.on("closed", () => {
        closeStatusWindow();
        petStatus = null;
        cancelPetActionMove();
        if (cursorTimer) {
            clearInterval(cursorTimer);
            cursorTimer = null;
        }
        petWindow = null;
    });
    petWindow.webContents.on("context-menu", () => {
        contextMenuOpen = true;
        hideCompanionBubble();
        cancelPetActionMove();
        const menu = Menu.buildFromTemplate([
            { label: "设置", click: () => void openSettingsWindow() },
            { label: "动作", click: () => void openActionsWindow() },
            { label: "查看状态", click: () => void openStatusWindow() },
            {
                label: "鼠标跟随", type: "checkbox", checked: loadConfig().pet.followMouse,
                click: () => {
                    const next = updateConfig({ pet: { followMouse: !loadConfig().pet.followMouse } });
                    for (const window of BrowserWindow.getAllWindows()) {
                        window.webContents.send(IPC_CHANNELS.configChanged, next);
                    }
                }
            },
            { type: "separator" },
            { label: "退出", click: () => app.quit() }
        ]);
        menu.popup({ callback: () => { contextMenuOpen = false; } });
    });
    const url = rendererUrl("pet");
    if (url) {
        await petWindow.loadURL(url);
    }
    else {
        await petWindow.loadFile(join(__dirname, "../renderer/index.html"));
    }
    return petWindow;
}
function presentSettingsWindow(window) {
    closeStatusWindow();
    hideCompanionBubble();
    hideActionsWindow();
    if (window.isMinimized()) {
        window.restore();
    }
    const bounds = window.getBounds();
    const { workArea } = screen.getDisplayMatching(bounds);
    const width = Math.min(bounds.width, workArea.width);
    const height = Math.min(bounds.height, workArea.height);
    window.setBounds({
        width,
        height,
        x: Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width)),
        y: Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height))
    });
    window.show();
    window.moveTop();
    window.focus();
}
export async function openSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        presentSettingsWindow(settingsWindow);
        return settingsWindow;
    }
    settingsWindow = new BrowserWindow({
        width: 520,
        height: 640,
        show: false,
        title: "罗小黑桌宠设置",
        icon: appIcon(),
        webPreferences: {
            preload: preloadPath(),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    forwardRendererConsole(settingsWindow, "settings");
    settingsWindow.on("closed", () => {
        settingsWindow = null;
    });
    const url = rendererUrl("settings");
    if (url) {
        await settingsWindow.loadURL(url);
    }
    else {
        await settingsWindow.loadFile(join(__dirname, "../renderer/settings.html"));
    }
    presentSettingsWindow(settingsWindow);
    return settingsWindow;
}
export function hideActionsWindow() {
    if (actionsWindow && !actionsWindow.isDestroyed())
        actionsWindow.hide();
}
function positionActionsWindow(window, pet) {
    const bounds = pet.getBounds();
    const { workArea } = displayForBounds(bounds);
    // Scale with the pet, while keeping ten labels and direction choices usable.
    // Preserve the fan's aspect ratio even on a small display.
    const desiredWidth = Math.max(380, Math.min(600, bounds.width * 1.2 + 80));
    const width = Math.floor(Math.min(desiredWidth, workArea.width, workArea.height / 0.6));
    const height = Math.round(width * 0.6);
    window.setBounds({
        width, height,
        x: Math.round(Math.max(workArea.x, Math.min(bounds.x + bounds.width / 2 - width / 2, workArea.x + workArea.width - width))),
        y: Math.round(Math.max(workArea.y, Math.min(bounds.y + bounds.height * 0.25 - height, workArea.y + workArea.height - height)))
    });
}
export async function openActionsWindow() {
    closeStatusWindow();
    hideCompanionBubble();
    const pet = getPetWindow();
    if (!pet || !pet.isVisible())
        return;
    if (!actionsWindow || actionsWindow.isDestroyed()) {
        const window = new BrowserWindow({
            width: 600, height: 360, title: "罗小黑桌宠动作", show: false,
            transparent: true, frame: false, thickFrame: false, hasShadow: false,
            resizable: false, skipTaskbar: true, alwaysOnTop: true,
            webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false }
        });
        actionsWindow = window;
        forwardRendererConsole(window, "actions");
        window.setMenu(null);
        window.on("blur", () => window.hide());
        window.on("closed", () => {
            if (actionsWindow === window) {
                actionsWindow = null;
                actionsWindowReady = null;
            }
        });
        window.webContents.on("before-input-event", (event, input) => {
            if (input.type === "keyDown" && input.key === "Escape") {
                event.preventDefault();
                window.hide();
            }
        });
        const url = rendererUrl("actions");
        actionsWindowReady = url ? window.loadURL(url) : window.loadFile(join(__dirname, "../renderer/actions.html"));
    }
    await actionsWindowReady;
    const window = actionsWindow;
    if (!window || window.isDestroyed() || pet.isDestroyed() || !pet.isVisible())
        return;
    window.setAlwaysOnTop(true, "pop-up-menu");
    positionActionsWindow(window, pet);
    window.show();
    window.moveTop();
    window.focus();
}
export function publishPetStatus(status) {
    petStatus = status;
    if (statusWindow && !statusWindow.isDestroyed()) {
        statusWindow.webContents.send(IPC_CHANNELS.petStatusChanged, status);
    }
}
export function getPetStatus() {
    return getPetWindow() ? petStatus : null;
}
export function closeStatusWindow() {
    if (statusWindow && !statusWindow.isDestroyed())
        statusWindow.close();
}
export async function openStatusWindow() {
    const pet = getPetWindow();
    if (!pet || !pet.isVisible())
        return;
    hideCompanionBubble();
    hideActionsWindow();
    if (!statusWindow || statusWindow.isDestroyed()) {
        const window = new BrowserWindow({
            width: 380, height: 450, useContentSize: true, show: false,
            title: "罗小黑的状态", backgroundColor: "#f4f7f2", icon: appIcon(),
            resizable: false, maximizable: false, skipTaskbar: true,
            webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false }
        });
        statusWindow = window;
        window.setMenu(null);
        forwardRendererConsole(window, "status");
        window.on("closed", () => {
            if (statusWindow === window) {
                statusWindow = null;
                statusWindowReady = null;
            }
        });
        window.webContents.on("before-input-event", (event, input) => {
            if (input.type === "keyDown" && input.key === "Escape") {
                event.preventDefault();
                window.close();
            }
        });
        const url = rendererUrl("status");
        statusWindowReady = url ? window.loadURL(url) : window.loadFile(join(__dirname, "../renderer/status.html"));
    }
    const window = statusWindow;
    await statusWindowReady;
    if (window.isDestroyed() || pet.isDestroyed() || !pet.isVisible())
        return;
    if (window.isMinimized())
        window.restore();
    const bounds = pet.getBounds();
    const { workArea } = displayForBounds(bounds);
    const size = window.getBounds();
    const width = Math.min(size.width, workArea.width);
    const height = Math.min(size.height, workArea.height);
    window.setBounds({
        width, height,
        x: Math.round(Math.max(workArea.x, Math.min(bounds.x + bounds.width / 2 - width / 2, workArea.x + workArea.width - width))),
        y: Math.round(Math.max(workArea.y, Math.min(bounds.y + bounds.height / 2 - height / 2, workArea.y + workArea.height - height)))
    });
    window.setAlwaysOnTop(true, "pop-up-menu");
    window.show();
    window.moveTop();
    window.focus();
}
export function getPetWindow() {
    return petWindow && !petWindow.isDestroyed() ? petWindow : null;
}
export function cancelPetActionMove() {
    if (!actionMoveTimer)
        return;
    clearInterval(actionMoveTimer);
    actionMoveTimer = null;
    const bounds = getPetWindow()?.getBounds();
    if (bounds)
        updateConfig({ window: { x: bounds.x, y: bounds.y } });
}
export function ensurePetWalkDirectionAvailable(direction) {
    const window = getPetWindow();
    if (!window)
        return;
    const bounds = window.getBounds();
    const { workArea } = displayForBounds(bounds);
    const space = direction === "left" ? bounds.x - workArea.x : workArea.x + workArea.width - bounds.x - bounds.width;
    if (space < 2)
        throw new Error(`已经到屏幕${direction === "left" ? "左" : "右"}边缘了，请选择另一方向`);
}
export function movePetWindowForAction(pixelsPerUnit, direction) {
    cancelPetActionMove();
    const window = getPetWindow();
    if (!window || loadConfig().window.locked)
        return;
    const start = window.getBounds();
    const { workArea } = displayForBounds(start);
    const right = workArea.x + workArea.width - start.x - start.width;
    const left = start.x - workArea.x;
    const sign = direction ? (direction === "right" ? 1 : -1) : (right >= left ? 1 : -1);
    const distance = Math.min(pixelsPerUnit * WALK_STRIDE_UNITS * WALK_STEPS, sign > 0 ? right : left) * sign;
    const stride = distance / WALK_STEPS / pixelsPerUnit;
    const beganAt = Date.now();
    actionMoveTimer = setInterval(() => {
        if (window.isDestroyed() || loadConfig().window.locked) {
            cancelPetActionMove();
            return;
        }
        const progress = Math.min(1, (Date.now() - beganAt) / WALK_DURATION_MS);
        setPetPosition(start.x + distance / WALK_STEPS * walkTravel(progress), start.y);
        window.webContents.send(IPC_CHANNELS.petWalkFrame, {
            progress, distance: (window.getBounds().x - start.x) / pixelsPerUnit, stride
        });
        if (progress === 1)
            cancelPetActionMove();
    }, 16);
}
export function applyPetWindowConfig() {
    const window = getPetWindow();
    if (!window) {
        return;
    }
    const config = loadConfig();
    window.setAlwaysOnTop(config.window.alwaysOnTop);
    window.setIgnoreMouseEvents(config.window.clickThrough, { forward: true });
    if (config.window.visible) {
        if (!window.isVisible())
            window.showInactive();
    }
    else {
        hideCompanionBubble();
        closeStatusWindow();
        cancelPetActionMove();
        window.hide();
        hideActionsWindow();
    }
    const bounds = window.getBounds();
    const size = petSize(config.window.scale);
    const [contentWidth, contentHeight] = window.getContentSize();
    const widthChanged = contentWidth !== size.width;
    const heightChanged = contentHeight !== size.height;
    const nextBounds = clampBounds({
        x: config.window.x ?? bounds.x,
        y: config.window.y ?? (heightChanged ? bounds.y + contentHeight - size.height : bounds.y),
        ...size
    });
    if (bounds.x !== nextBounds.x ||
        bounds.y !== nextBounds.y ||
        widthChanged ||
        heightChanged) {
        setPetBounds(nextBounds);
    }
}
export function previewPetWindowPosition(position) {
    const window = getPetWindow();
    if (!window) {
        return;
    }
    const bounds = enforcePetSize("preview") ?? window.getBounds();
    const nextBounds = clampBounds({ ...bounds, x: position.x ?? bounds.x, y: position.y ?? bounds.y });
    setPetPosition(nextBounds.x, nextBounds.y);
}
export function startPetWindowDrag() {
    cancelPetActionMove();
    hideActionsWindow();
    const window = getPetWindow();
    if (!window || loadConfig().window.locked) {
        dragStartBounds = null;
        return;
    }
    dragStartBounds = enforcePetSize("drag-start") ?? window.getBounds();
}
export function movePetWindowBy(delta) {
    const window = getPetWindow();
    if (!window || loadConfig().window.locked) {
        return;
    }
    const startBounds = dragStartBounds ?? (enforcePetSize("drag-move") ?? window.getBounds());
    const nextBounds = clampBounds({
        ...startBounds,
        x: startBounds.x + (delta.dx ?? 0),
        y: startBounds.y + (delta.dy ?? 0)
    });
    setPetPosition(nextBounds.x, nextBounds.y);
}
export function settlePetWindowDrag(delta) {
    if (loadConfig().window.locked) {
        dragStartBounds = null;
        return loadConfig();
    }
    const window = getPetWindow();
    const startBounds = dragStartBounds ?? (enforcePetSize("drag-end") ?? window?.getBounds() ?? defaultPetBounds());
    dragStartBounds = null;
    const size = expectedLockedPetSize();
    const nextBounds = clampBounds({
        ...startBounds,
        ...size,
        x: startBounds.x + (delta.dx ?? 0),
        y: startBounds.y + (delta.dy ?? 0)
    });
    setPetBounds(nextBounds);
    const actual = window?.getBounds() ?? nextBounds;
    return updateConfig({ window: { x: actual.x, y: actual.y } });
}
export function settlePetWindowPosition(position) {
    const window = getPetWindow();
    const currentBounds = enforcePetSize("settle") ?? window?.getBounds() ?? defaultPetBounds();
    const size = expectedPetSize();
    const nextBounds = snapBounds({
        ...currentBounds,
        ...size,
        x: position.x ?? currentBounds.x,
        y: position.y ?? currentBounds.y
    });
    setPetBounds(nextBounds);
    return updateConfig({ window: { x: nextBounds.x, y: nextBounds.y } });
}
export function resetPetWindowPosition() {
    cancelPetActionMove();
    const nextBounds = clampBounds(defaultPetBounds());
    setPetBounds(nextBounds);
    return updateConfig({ window: { x: nextBounds.x, y: nextBounds.y } });
}
