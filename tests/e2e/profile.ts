import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import type { ElectronApplication } from "@playwright/test";

// Keep desktop clicks from changing a test scenario while CDP still drives the
// actual renderer controls. In production the fan still closes on focus loss.
export async function protectTestWindows(application: ElectronApplication) {
  await application.evaluate(({ BrowserWindow, app }) => {
    const protect = (window: Electron.BrowserWindow) => {
      const ignore = window.setIgnoreMouseEvents.bind(window);
      window.setIgnoreMouseEvents = () => ignore(true);
      ignore(true);
      window.webContents.on("did-finish-load", () => {
        if (window.getTitle() === "罗小黑桌宠动作") window.removeAllListeners("blur");
      });
    };
    BrowserWindow.getAllWindows().forEach(protect);
    app.on("browser-window-created", (_event, window) => protect(window));
  });
}

export function createTestProfile() {
  const root = resolve(".tmp/e2e");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(resolve(root, "profile-"));
  const executablePath = process.env.XIAOHEI_E2E_EXECUTABLE;
  const args = [...(executablePath ? [] : ["."]), `--user-data-dir=${directory}`];
  return {
    args,
    launchOptions: { args, executablePath },
    configPath: resolve(directory, "config.json")
  };
}
