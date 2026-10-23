import { _electron as electron, expect, test } from "@playwright/test";
import { createTestProfile } from "./profile.js";

test("repeated moves preserve exact window size and respect position lock", async () => {
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    const pet = await app.firstWindow();
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      (globalThis as any).__resizableChanges = 0;
      const original = window.setResizable.bind(window);
      window.setResizable = (resizable) => { (globalThis as any).__resizableChanges++; original(resizable); };
    });
    for (const scale of [0.4, 0.7, 1, 2]) {
      await pet.evaluate(async (scale) => {
        await window.xiaohei.config.update({ window: { scale } });
        for (let i = 0; i < 10; i++) {
          await window.xiaohei.pet.startDrag();
          await window.xiaohei.pet.moveDrag({ dx: -3, dy: -3 });
          await window.xiaohei.pet.endDrag({ dx: -3, dy: -3 });
        }
      }, scale);
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()))
        .toEqual([Math.round(360 * scale), Math.round(520 * scale)]);
      expect(await pet.evaluate(() => [innerWidth, innerHeight]))
        .toEqual([Math.round(360 * scale), Math.round(520 * scale)]);
    }
    const locked = await pet.evaluate(async () => {
      await window.xiaohei.config.update({ window: { locked: true } });
      const before = await window.xiaohei.config.get();
      await window.xiaohei.pet.startDrag();
      await window.xiaohei.pet.moveDrag({ dx: -100, dy: -100 });
      const after = await window.xiaohei.pet.endDrag({ dx: -100, dy: -100 });
      return { before: before.window, after: after.window };
    });
    expect(locked.after).toEqual(locked.before);
    expect(await app.evaluate(({ BrowserWindow }) => ({
      changes: (globalThis as any).__resizableChanges,
      resizable: BrowserWindow.getAllWindows()[0].isResizable()
    }))).toEqual({ changes: 0, resizable: false });
  } finally {
    await app.close();
  }
});
