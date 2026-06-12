import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc.js";
const bridge = {
    config: {
        get: () => ipcRenderer.invoke(IPC_CHANNELS.configGet),
        update: (patch) => ipcRenderer.invoke(IPC_CHANNELS.configUpdate, patch),
        onChanged: (callback) => {
            const listener = (_event, config) => callback(config);
            ipcRenderer.on(IPC_CHANNELS.configChanged, listener);
            return () => ipcRenderer.off(IPC_CHANNELS.configChanged, listener);
        }
    },
    pet: {
        updatePosition: (position) => ipcRenderer.invoke(IPC_CHANNELS.petPositionUpdate, position),
        setVisibility: (visible) => ipcRenderer.invoke(IPC_CHANNELS.petVisibilitySet, visible),
        setClickThrough: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.petClickThroughSet, enabled)
    },
    app: {
        setAutoLaunch: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.appAutoLaunchSet, enabled),
        openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settingsOpen),
        quit: () => ipcRenderer.invoke(IPC_CHANNELS.appQuit)
    }
};
contextBridge.exposeInMainWorld("xiaohei", bridge);
