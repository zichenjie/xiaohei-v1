import { _electron as electron, expect, test } from "@playwright/test";
import { createTestProfile } from "./profile.js";

test("desktop pet launches and exposes config IPC through preload", async () => {
  const app = await electron.launch(createTestProfile().launchOptions);

  try {
    const firstWindow = await app.firstWindow();
    await expect(firstWindow.locator("body")).toBeVisible();
    await expect(firstWindow).toHaveTitle("");
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())).toBe("");

    const config = await firstWindow.evaluate(async () => {
      return window.xiaohei.config.get();
    });

    expect(config.schemaVersion).toBe(1);
    expect(config.pet.modelPath).toContain("罗小黑免费模型.model3.json");
  } finally {
    try {
      await app.close();
    } catch {
      // The original launch/assertion failure is more useful than a cleanup error.
    }
  }
});
