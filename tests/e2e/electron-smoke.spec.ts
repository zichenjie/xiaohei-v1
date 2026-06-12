import { _electron as electron, expect, test } from "@playwright/test";

test("desktop pet launches and exposes config IPC through preload", async () => {
  const app = await electron.launch({ args: ["."] });

  try {
    const firstWindow = await app.firstWindow();
    await expect(firstWindow.locator("body")).toBeVisible();

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
