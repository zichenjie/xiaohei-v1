import { app } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
export function resolveResourcePath(relativePath) {
    const packagedPath = join(process.resourcesPath, relativePath);
    if (app.isPackaged && existsSync(packagedPath)) {
        return packagedPath;
    }
    return join(app.getAppPath(), relativePath);
}
