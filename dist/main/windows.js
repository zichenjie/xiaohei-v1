import { BrowserWindow, Menu, app, nativeImage, screen } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, updateConfig } from "./config.js";
import { resolveResourcePath } from "./resources.js";
import { IPC_CHANNELS } from "../shared/ipc.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
let petWindow = null;
let settingsWindow = null;
let applyingPetBounds = false;
let dragStartBounds = null;
let lockedPetSize = null;
let cursorTimer = null;
function rendererUrl(page) {
    const devServerArg = process.argv.find((arg) => arg.startsWith("--dev-server-url="));
    const devServerUrl = devServerArg?.slice("--dev-server-url=".length) ?? process.env.VITE_DEV_SERVER_URL;
    if (!devServerUrl) {
        return null;
    }
    return page === "pet" ? devServerUrl : `${devServerUrl}/settings.html`;
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
    const { workArea } = displayForBounds(bounds);
    const maxX = workArea.x + workArea.width - bounds.width;
    const maxY = workArea.y + workArea.height - bounds.height;
    return {
        ...bounds,
        x: Math.min(Math.max(bounds.x, workArea.x), maxX),
        y: Math.min(Math.max(bounds.y, workArea.y), maxY)
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
function unlockPetWindowSize(window) {
    window.setMinimumSize(1, 1);
    window.setMaximumSize(10000, 10000);
}
function lockPetWindowSize(window, size = expectedPetSize()) {
    lockedPetSize = size;
    window.setResizable(false);
    window.setMinimumSize(size.width, size.height);
    window.setMaximumSize(size.width, size.height);
}
function setPetBounds(bounds) {
    const window = getPetWindow();
    if (!window) {
        return;
    }
    applyingPetBounds = true;
    unlockPetWindowSize(window);
    window.setBounds(bounds);
    const actualBounds = window.getBounds();
    lockPetWindowSize(window, { width: actualBounds.width, height: actualBounds.height });
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
    window.setBounds({
        x: Math.round(x),
        y: Math.round(y),
        width: size.width,
        height: size.height
    });
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
    if (bounds.width === size.width && bounds.height === size.height) {
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
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    forwardRendererConsole(petWindow, "pet");
    lockPetWindowSize(petWindow, { width: petWindow.getBounds().width, height: petWindow.getBounds().height });
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
        if (cursorTimer) {
            clearInterval(cursorTimer);
            cursorTimer = null;
        }
        petWindow = null;
    });
    const menu = Menu.buildFromTemplate([
        { label: "打开设置", click: () => void openSettingsWindow() },
        { type: "separator" },
        { label: "退出", click: () => app.quit() }
    ]);
    petWindow.webContents.on("context-menu", () => menu.popup());
    const url = rendererUrl("pet");
    if (url) {
        await petWindow.loadURL(url);
    }
    else {
        await petWindow.loadFile(join(__dirname, "../renderer/index.html"));
    }
    return petWindow;
}
export async function openSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.focus();
        return settingsWindow;
    }
    settingsWindow = new BrowserWindow({
        width: 520,
        height: 640,
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
    return settingsWindow;
}
export function getPetWindow() {
    return petWindow && !petWindow.isDestroyed() ? petWindow : null;
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
        window.show();
    }
    else {
        window.hide();
    }
    const bounds = window.getBounds();
    const size = petSize(config.window.scale);
    const widthChanged = bounds.width !== size.width;
    const heightChanged = bounds.height !== size.height;
    const nextBounds = clampBounds({
        x: config.window.x ?? bounds.x,
        y: config.window.y ?? (heightChanged ? bounds.y + bounds.height - size.height : bounds.y),
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
    const window = getPetWindow();
    if (!window) {
        dragStartBounds = null;
        return;
    }
    dragStartBounds = enforcePetSize("drag-start") ?? window.getBounds();
}
export function movePetWindowBy(delta) {
    const window = getPetWindow();
    if (!window) {
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
    return updateConfig({ window: { x: nextBounds.x, y: nextBounds.y } });
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
    const nextBounds = clampBounds(defaultPetBounds());
    setPetBounds(nextBounds);
    return updateConfig({ window: { x: nextBounds.x, y: nextBounds.y } });
}
