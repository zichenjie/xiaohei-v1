import { app } from "electron";
import { logError } from "./logging.js";
export function setAutoLaunch(enabled) {
    try {
        app.setLoginItemSettings({
            openAtLogin: enabled,
            path: process.execPath
        });
        const actual = app.getLoginItemSettings().openAtLogin;
        return { success: actual === enabled, enabled: actual };
    }
    catch (error) {
        logError("Failed to update auto launch", error);
        try {
            return { success: false, enabled: app.getLoginItemSettings().openAtLogin };
        }
        catch {
            return { success: false, enabled: false };
        }
    }
}
export function isAutoLaunchEnabled() {
    return app.getLoginItemSettings().openAtLogin;
}
