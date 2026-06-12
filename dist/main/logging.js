import { app } from "electron";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
export function logError(message, error) {
    const logDir = app.getPath("logs");
    mkdirSync(logDir, { recursive: true });
    const detail = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error ?? "");
    appendFileSync(join(logDir, "xiaohei.log"), `[${new Date().toISOString()}] ${message}\n${detail}\n\n`, "utf8");
}
