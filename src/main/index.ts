import { app } from "electron";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerIpcHandlers } from "./ipc.js";
import { logError } from "./logging.js";
import { createTray } from "./tray.js";
import { createPetWindow, openSettingsWindow } from "./windows.js";
import { registerCompanionIpc, startCompanionMonitor } from "./companion.js";

if (!app.isPackaged || app.commandLine.hasSwitch("user-data-dir")) {
  const userDataPath = app.commandLine.getSwitchValue("user-data-dir") || join(app.getAppPath(), ".tmp/electron-user-data");
  const cachePath = join(tmpdir(), `xiaohei-electron-cache-${process.pid}`);
  mkdirSync(userDataPath, { recursive: true });
  mkdirSync(cachePath, { recursive: true });
  app.setPath("userData", userDataPath);
  // Keep local companion state across restarts. Only the disposable disk cache
  // belongs in the process-specific temp folder.
  const sessionPath = join(userDataPath, "session");
  mkdirSync(sessionPath, { recursive: true });
  app.setPath("sessionData", sessionPath);
  app.commandLine.appendSwitch("disk-cache-dir", cachePath);
}

registerIpcHandlers(() => openSettingsWindow());
registerCompanionIpc();

app
  .whenReady()
  .then(async () => {
    await createPetWindow();
    startCompanionMonitor();
    createTray();
    if (process.argv.includes("--open-settings")) {
      await openSettingsWindow();
    }
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
