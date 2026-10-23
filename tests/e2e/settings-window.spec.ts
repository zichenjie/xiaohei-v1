import { _electron as electron, expect, test } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";

test("opening settings restores hidden and minimized windows and brings them on screen", async () => {
  const app = await electron.launch(createTestProfile().launchOptions);
  await protectTestWindows(app);
  try {
    const pet = await app.firstWindow();
    const settingsReady = app.waitForEvent("window");
    await pet.evaluate(() => window.xiaohei.app.openSettings());
    const settings = await settingsReady;
    await expect(settings.getByRole("heading", { name: "罗小黑桌宠设置" })).toBeVisible();
    for (const state of ["minimized", "hidden", "offscreen"] as const) {
      await app.evaluate(({ BrowserWindow }, state) => {
        const window = BrowserWindow.getAllWindows().find((window) => window.getTitle() === "罗小黑桌宠设置")!;
        if (state === "minimized") window.minimize();
        if (state === "hidden") window.hide();
        if (state === "offscreen") window.setPosition(-10000, -10000);
      }, state);
      await pet.evaluate(() => window.xiaohei.app.openSettings());
      await expect.poll(() => app.evaluate(({ BrowserWindow, screen }) => {
        const window = BrowserWindow.getAllWindows().find((window) => window.getTitle() === "罗小黑桌宠设置")!;
        const bounds = window.getBounds();
        const { workArea } = screen.getDisplayMatching(bounds);
        return {
          visible: window.isVisible(), minimized: window.isMinimized(), focused: window.isFocused(),
          onScreen: bounds.x >= workArea.x && bounds.y >= workArea.y &&
            bounds.x + bounds.width <= workArea.x + workArea.width + 1 &&
            bounds.y + bounds.height <= workArea.y + workArea.height + 1
        };
      })).toEqual({ visible: true, minimized: false, focused: true, onScreen: true });
      await expect(settings.getByRole("heading", { name: "罗小黑桌宠设置" })).toBeVisible();
    }
    expect(app.windows()).toHaveLength(2);
  } finally {
    await app.close();
  }
});
