import { app } from "electron";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerIpcHandlers } from "./ipc.js";
import { logError } from "./logging.js";
import { createTray } from "./tray.js";
import { createPetWindow, openSettingsWindow } from "./windows.js";

if (!app.isPackaged) {
  const userDataPath = join(app.getAppPath(), ".tmp/electron-user-data");
  const cachePath = join(tmpdir(), `xiaohei-electron-cache-${process.pid}`);
  mkdirSync(userDataPath, { recursive: true });
  mkdirSync(cachePath, { recursive: true });
  app.setPath("userData", userDataPath);
  app.setPath("sessionData", cachePath);
  app.commandLine.appendSwitch("disk-cache-dir", cachePath);
}

registerIpcHandlers(() => void openSettingsWindow());

app
  .whenReady()
  .then(async () => {
    await createPetWindow();
    createTray();
  })
  .catch((error) => {
    logError("Failed to start application", error);
  });

app.on("window-all-closed", () => {
  // Keep the tray app alive until the user explicitly exits.
});

process.on("uncaughtException", (error) => {
  logError("Uncaught exception", error);
});

process.on("unhandledRejection", (reason) => {
  logError("Unhandled rejection", reason);
});
