import { BrowserWindow, Menu, Tray, app, nativeImage } from "electron";
import { IPC_CHANNELS } from "../shared/ipc.js";
import type { AppConfig } from "../shared/types.js";
import { loadConfig, updateConfig } from "./config.js";
import { setAutoLaunch } from "./autostart.js";
import { resolveResourcePath } from "./resources.js";
import {
  applyPetWindowConfig,
  createPetWindow,
  getPetWindow,
  openSettingsWindow,
  resetPetWindowPosition
} from "./windows.js";

let tray: Tray | null = null;

function broadcastConfigChanged(config: AppConfig): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.configChanged, config);
  }
}

function saveAndBroadcast(patch: Parameters<typeof updateConfig>[0]): AppConfig {
  const config = updateConfig(patch);
  applyPetWindowConfig();
  broadcastConfigChanged(config);
  return config;
}

export function createTray(): Tray {
  if (tray) {
    return tray;
  }

  tray = new Tray(nativeImage.createFromPath(resolveResourcePath("assets/tray.ico")));
  tray.setToolTip("罗小黑桌宠");
  refreshTrayMenu();
  return tray;
}

export function refreshTrayMenu(): void {
  if (!tray) {
    return;
  }

  const config = loadConfig();

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: config.window.visible ? "隐藏桌宠" : "显示桌宠",
        click: () => {
          const visible = !loadConfig().window.visible;
          saveAndBroadcast({ window: { visible } });
          const petWindow = getPetWindow();
          if (visible) {
            petWindow?.show();
            if (!petWindow && visible) {
              void createPetWindow();
            }
          } else {
            petWindow?.hide();
          }
          refreshTrayMenu();
        }
      },
      { label: "打开设置", click: () => void openSettingsWindow() },
      {
        label: "回到默认位置",
        click: () => {
          const config = resetPetWindowPosition();
          broadcastConfigChanged(config);
          refreshTrayMenu();
        }
      },
      { type: "separator" },
      {
        label: "安静模式",
        type: "radio",
        checked: config.pet.behaviorMode === "quiet",
        click: () => {
          saveAndBroadcast({ pet: { behaviorMode: "quiet" } });
          refreshTrayMenu();
        }
      },
      {
        label: "活泼模式",
        type: "radio",
        checked: config.pet.behaviorMode === "active",
        click: () => {
          saveAndBroadcast({ pet: { behaviorMode: "active" } });
          refreshTrayMenu();
        }
      },
      { type: "separator" },
      {
        label: "锁定位置",
        type: "checkbox",
        checked: config.window.locked,
        click: (item) => {
          saveAndBroadcast({ window: { locked: item.checked } });
          refreshTrayMenu();
        }
      },
      {
        label: "鼠标穿透",
        type: "checkbox",
        checked: config.window.clickThrough,
        click: (item) => {
          saveAndBroadcast({ window: { clickThrough: item.checked } });
          getPetWindow()?.setIgnoreMouseEvents(item.checked, { forward: true });
          refreshTrayMenu();
        }
      },
      {
        label: "开机自启",
        type: "checkbox",
        checked: config.system.autoLaunch,
        click: (item) => {
          const result = setAutoLaunch(item.checked);
          if (result.success) {
            saveAndBroadcast({ system: { autoLaunch: result.enabled } });
          }
          refreshTrayMenu();
        }
      },
      { type: "separator" },
      { label: "退出", click: () => app.quit() }
    ])
  );
}
