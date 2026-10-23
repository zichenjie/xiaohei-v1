import { _electron as electron, expect, test } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";

test("context menu toggles mouse follow and stays synchronized with settings", async () => {
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    await protectTestWindows(app);
    const pet = await app.firstWindow();
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await pet.evaluate(() => window.xiaohei.config.update({ pet: { followMouse: false } }));
    await pet.evaluate(() => window.xiaohei.app.openSettings());
    const settings = app.windows().find((p) => p.url().includes("settings.html"))!;
    const checkbox = settings.getByRole("checkbox", { name: "鼠标跟随", exact: true });
    await expect(checkbox).not.toBeChecked();
    await app.evaluate(({ Menu }) => { Menu.prototype.popup = function () { (globalThis as any).__followMenu = this; }; });
    const open = async () => {
      await pet.locator(".pet-hit-area").click({ button: "right" });
      return app.evaluate(() => {
        const item = (globalThis as any).__followMenu.items.find((i: any) => i.label === "鼠标跟随");
        return { type: item.type, checked: item.checked };
      });
    };
    const toggle = () => app.evaluate(() => {
      const item = (globalThis as any).__followMenu.items.find((i: any) => i.label === "鼠标跟随");
      item.click(item, undefined, {});
    });
    expect(await open()).toEqual({ type: "checkbox", checked: false });
    await toggle();
    await expect(checkbox).toBeChecked();
    expect((await pet.evaluate(() => window.xiaohei.config.get())).pet.followMouse).toBe(true);
    expect(await open()).toEqual({ type: "checkbox", checked: true });
    await toggle();
    await expect(checkbox).not.toBeChecked();
    await expect.poll(() => pet.evaluate(() => {
      let l = (window as any).PIXI.Ticker.shared._head.next;
      while (!l.context?.internalModel) l = l.next;
      const f = l.context.internalModel.focusController;
      return { x: f.x, y: f.y };
    })).toEqual({ x: 0, y: 0 });
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    expect(await open()).toEqual({ type: "checkbox", checked: true });
  } finally {
    await app.close();
  }
});
