import { app, BrowserWindow, ipcMain, powerMonitor, screen } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { IPC_CHANNELS } from "../shared/ipc.js";
import { COMPANION_COPY, type CompanionBubble, type CompanionContext } from "../shared/companion.js";
import { bubbleLayout } from "../shared/bubbleLayout.js";
import { loadConfig } from "./config.js";
import { getPetWindow, isCompanionUiBusy } from "./windows.js";

const directory = dirname(fileURLToPath(import.meta.url));
let bubbleWindow: BrowserWindow | null = null;
let ready: Promise<void> | null = null;
let current: CompanionBubble | null = null;
let expiresAt = 0;
let locked = false;
let suspended = false;
let resumeAfter = 0;
let timer: NodeJS.Timeout | null = null;

export function companionContext(): CompanionContext {
  const pet = getPetWindow();
  return {
    idleSeconds: powerMonitor.getSystemIdleTime(),
    blocked: locked || suspended || Date.now() < resumeAfter || isCompanionUiBusy()
      || !pet?.isVisible() || pet.isMinimized() || loadConfig().window.clickThrough
  };
}

export function hideCompanionBubble() {
  current = null;
  expiresAt = 0;
  if (bubbleWindow && !bubbleWindow.isDestroyed()) {
    bubbleWindow.hide();
    bubbleWindow.webContents.send(IPC_CHANNELS.companionBubbleChanged, null);
  }
}

export function positionCompanionBubble() {
  const pet = getPetWindow();
  if (!pet || !current || !bubbleWindow || bubbleWindow.isDestroyed()) return;
  const bounds = pet.getBounds();
  const work = screen.getDisplayMatching(bounds).workArea;
  bubbleWindow.setBounds(bubbleLayout(bounds, current.anchor, work));
}

function validBubble(value: unknown): value is CompanionBubble {
  if (!value || typeof value !== "object") return false;
  const b = value as CompanionBubble;
  return typeof b.id === "string" && b.id.length < 100 && Object.hasOwn(COMPANION_COPY, b.kind)
    && Number.isFinite(b.expiresAt) && !!b.anchor && [b.anchor.x, b.anchor.y, b.anchor.width].every(Number.isFinite)
    && b.anchor.width > 0 && b.anchor.width < 5000 && Math.abs(b.anchor.x) < 5000 && Math.abs(b.anchor.y) < 5000;
}

export function registerCompanionIpc() {
  ipcMain.handle(IPC_CHANNELS.companionContext, () => companionContext());
  ipcMain.handle(IPC_CHANNELS.companionBubbleGet, (event) => event.sender === bubbleWindow?.webContents ? current : null);
  ipcMain.handle(IPC_CHANNELS.companionBubbleSet, async (event, value: unknown) => {
    if (event.sender !== getPetWindow()?.webContents) return false;
    if (value === null) { hideCompanionBubble(); return true; }
    if (!validBubble(value) || companionContext().blocked) return false;
    current = value;
    // Use a local deadline as well so renderer stalls cannot leave a bubble up.
    expiresAt = Date.now() + (value.kind === "thanks" || value.kind === "busy" ? 3000 : 8000);
    if (!bubbleWindow || bubbleWindow.isDestroyed()) {
      const window = new BrowserWindow({
        width: 240, height: 110, show: false, title: "罗小黑的悄悄话",
        transparent: true, frame: false, thickFrame: false, hasShadow: false,
        resizable: false, skipTaskbar: true, focusable: false,
        webPreferences: { preload: join(directory, "../preload/index.cjs"), contextIsolation: true, nodeIntegration: false }
      });
      bubbleWindow = window;
      window.setMenu(null);
      window.on("closed", () => { if (bubbleWindow === window) { bubbleWindow = null; ready = null; current = null; } });
      const dev = process.argv.find((a) => a.startsWith("--dev-server-url="))?.slice("--dev-server-url=".length) ?? process.env.VITE_DEV_SERVER_URL;
      ready = dev ? window.loadURL(`${dev}/companion.html`) : window.loadFile(join(directory, "../renderer/companion.html"));
    }
    await ready;
    // A manual action, menu, lock or a newer request may have arrived while loading.
    if (current !== value || companionContext().blocked || !bubbleWindow || bubbleWindow.isDestroyed()) return false;
    positionCompanionBubble();
    bubbleWindow.setAlwaysOnTop(loadConfig().window.alwaysOnTop);
    bubbleWindow.webContents.send(IPC_CHANNELS.companionBubbleChanged, current);
    bubbleWindow.showInactive();
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.companionReply, (event, reply: unknown) => {
    if (event.sender !== bubbleWindow?.webContents || !bubbleWindow.isVisible() || !current || Date.now() >= expiresAt || companionContext().blocked) return;
    const r = reply as { id?: unknown; response?: unknown } | null;
    if (!r || r.id !== current.id || !["touch", "play"].includes(current.kind) || !["accept", "busy"].includes(String(r.response))) return;
    hideCompanionBubble();
    getPetWindow()?.webContents.send(IPC_CHANNELS.companionReply, r);
  });
}

export function startCompanionMonitor() {
  locked = powerMonitor.getSystemIdleState(180) === "locked";
  const hide = () => hideCompanionBubble();
  const lock = () => { locked = true; hide(); };
  const unlock = () => { locked = false; resumeAfter = Date.now() + 60000; };
  const suspend = () => { suspended = true; hide(); };
  const resume = () => { suspended = false; resumeAfter = Date.now() + 60000; };
  powerMonitor.on("lock-screen", lock);
  powerMonitor.on("unlock-screen", unlock);
  powerMonitor.on("suspend", suspend);
  powerMonitor.on("resume", resume);
  timer = setInterval(() => {
    if (current && (companionContext().blocked || Date.now() >= expiresAt)) hide();
  }, 500);
  app.once("will-quit", () => {
    if (timer) clearInterval(timer);
    powerMonitor.off("lock-screen", lock); powerMonitor.off("unlock-screen", unlock);
    powerMonitor.off("suspend", suspend); powerMonitor.off("resume", resume);
  });
}
