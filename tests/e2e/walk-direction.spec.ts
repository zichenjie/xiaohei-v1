import { _electron as electron, expect, test } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";

test("movement menu chooses either direction and refuses walking out of the screen", async ({}, testInfo) => {
  test.setTimeout(60000);
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    await protectTestWindows(app);
    const pet = await app.firstWindow();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await pet.evaluate(() => window.xiaohei.config.update({ pet: { followMouse: false, behaviorMode: "quiet" }, window: { scale: 0.6, locked: false, x: 400, y: 500 } }));
    const x = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("/index.html"))!.getBounds().x);
    const open = async () => {
      await pet.evaluate(() => window.xiaohei.pet.openActions());
      const fan = app.windows().find((p) => p.url().includes("actions.html"))!;
      await fan.getByRole("button", { name: "移动", exact: true }).click();
      await expect(fan.getByRole("group", { name: "移动方向" })).toBeVisible();
      return fan;
    };
    for (const direction of ["left", "right"] as const) {
      await pet.evaluate(() => window.xiaohei.config.update({ window: { x: 400 } }));
      const before = await x();
      const fan = await open();
      expect(await x()).toBe(before); // Opening the chooser must not start walking.
      await fan.screenshot({ path: testInfo.outputPath(`choose-${direction}.png`) });
      await fan.getByRole("button", { name: direction === "left" ? "← 向左走" : "向右走 →", exact: true }).click();
      await expect.poll(x).not.toBe(before);
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Idle", { timeout: 6000 });
      expect(((await x()) - before) * (direction === "left" ? -1 : 1)).toBeGreaterThan(5);
    }
    for (const edge of ["left", "right"] as const) {
      await pet.evaluate((edge) => window.xiaohei.config.update({ window: { x: edge === "left" ? 0 : 99999 } }), edge);
      const before = await x();
      const fan = await open();
      await fan.getByRole("button", { name: edge === "left" ? "← 向左走" : "向右走 →", exact: true }).click();
      await expect(fan.getByRole("alert")).toContainText(`已经到屏幕${edge === "left" ? "左" : "右"}边缘`);
      expect(await x()).toBe(before);
      await fan.keyboard.press("Escape");
      await expect(fan.getByRole("group", { name: "移动方向" })).toHaveCount(0);
    }
    await pet.evaluate(() => window.xiaohei.config.update({ window: { locked: true } }));
    await pet.evaluate(() => window.xiaohei.pet.openActions());
    const fan = app.windows().find((p) => p.url().includes("actions.html"))!;
    await expect(fan.getByRole("button", { name: "移动", exact: true })).toBeDisabled();
  } finally {
    await app.close();
  }
});
