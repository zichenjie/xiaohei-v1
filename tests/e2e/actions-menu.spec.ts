import { _electron as electron, expect, test } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";

test("fan follows pet size while open and keeps labels and direction controls inside the window", async ({}, testInfo) => {
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    await protectTestWindows(app);
    const pet = await app.firstWindow();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await pet.evaluate(() => window.xiaohei.config.update({ window: { scale: 0.4, x: 400, y: 600 } }));
    await pet.evaluate(() => window.xiaohei.pet.openActions());
    const fan = app.windows().find((p) => p.url().includes("actions.html"))!;
    const sizes: number[] = [];
    for (const scale of [0.4, 0.7, 1, 2]) {
      await pet.evaluate((scale) => window.xiaohei.config.update({ window: { scale } }), scale);
      await expect.poll(() => fan.evaluate(() => innerWidth)).toBeGreaterThanOrEqual(380);
      // Check the visible native window has caught up with the new model size.
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const pet = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("/index.html"))!;
        const fan = BrowserWindow.getAllWindows().find((w) => w.getTitle() === "罗小黑桌宠动作")!;
        return Math.abs(fan.getBounds().width - Math.floor(Math.max(380, Math.min(600, pet.getBounds().width * 1.2 + 80))));
      })).toBeLessThanOrEqual(1);
      sizes.push(await fan.evaluate(() => innerWidth));
      await fan.getByRole("button", { name: "移动", exact: true }).click();
      const layout = await fan.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>("button, .fan-caption"));
        return nodes.map((node) => {
          const r = node.getBoundingClientRect();
          return { text: node.textContent, fits: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, font: parseFloat(getComputedStyle(node).fontSize) };
        });
      });
      expect(layout.every((node) => node.fits), JSON.stringify(layout)).toBe(true);
      expect(await fan.locator(".fan-caption").evaluate((node) => innerHeight - node.getBoundingClientRect().bottom)).toBeGreaterThan(4);
      expect(layout.filter((node) => node.text !== "×").every((node) => node.font >= 11)).toBe(true);
      await fan.screenshot({ path: testInfo.outputPath(`fan-scale-${scale}.png`) });
      await fan.keyboard.press("Escape");
    }
    expect(sizes[0]).toBeLessThan(sizes[2]);
    expect(sizes[2]).toBeLessThan(sizes[3]);
    expect(sizes[3]).toBeLessThanOrEqual(600);
  } finally {
    await app.close();
  }
});

test("pet context menu opens the fan above the pet and actions can be selected", async ({}, testInfo) => {
  test.setTimeout(60000);
  const app = await electron.launch(createTestProfile().launchOptions);
  await protectTestWindows(app);
  try {
    const pet = await app.firstWindow();
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await pet.evaluate(() => window.xiaohei.config.update({ window: { scale: 0.6, x: 600, y: 550 }, pet: { followMouse: false } }));
    await app.evaluate(({ Menu }) => {
      Menu.prototype.popup = function () { (globalThis as any).__petContextMenu = this; };
    });
    await pet.locator(".pet-hit-area").click({ button: "right" });
    expect(await app.evaluate(() => (globalThis as any).__petContextMenu.items.map((item: any) => item.label)))
      .toEqual(["设置", "动作", "查看状态", "鼠标跟随", "", "退出"]);
    await app.evaluate(() => {
      const menu = (globalThis as any).__petContextMenu;
      const item = menu.items.find((item: any) => item.label === "动作");
      item.click(item, undefined, {});
    });
    await expect.poll(() => app.windows().some((window) => window.url().includes("actions.html"))).toBe(true);
    const fan = app.windows().find((window) => window.url().includes("actions.html"))!;
    await expect(fan.getByRole("group", { name: "选择动作" }).getByRole("button")).toHaveCount(9);
    await expect(fan.getByRole("button", { name: "醒来", exact: true })).toHaveCount(0);
    const geometry = await app.evaluate(({ BrowserWindow }) => {
      const pet = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("/index.html"))!.getBounds();
      const fan = BrowserWindow.getAllWindows().find((window) => window.getTitle() === "罗小黑桌宠动作")!;
      return { pet, fan: fan.getBounds(), visible: fan.isVisible(), topmost: fan.isAlwaysOnTop() };
    });
    expect(geometry.visible).toBe(true);
    expect(geometry.topmost).toBe(true);
    expect(geometry.fan.y + geometry.fan.height).toBeLessThanOrEqual(geometry.pet.y + geometry.pet.height * 0.3 + 2);
    await fan.screenshot({ path: testInfo.outputPath("action-fan.png") });
    await fan.getByRole("button", { name: "待机", exact: true }).focus();
    await fan.keyboard.press("ArrowRight");
    await expect(fan.getByRole("button", { name: "弹跳", exact: true })).toBeFocused();
    await fan.keyboard.press("Enter");
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Bounce");
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.getTitle() === "罗小黑桌宠动作")!.isVisible())).toBe(false);
    await pet.evaluate(() => window.xiaohei.pet.openActions());
    await fan.keyboard.press("Escape");
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.getTitle() === "罗小黑桌宠动作")!.isVisible())).toBe(false);
    await pet.evaluate(() => window.xiaohei.pet.openActions());
    await fan.getByRole("button", { name: "收起动作菜单" }).click();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.getTitle() === "罗小黑桌宠动作")!.isVisible())).toBe(false);
    for (const position of [{ x: 0, y: 0 }, { x: 99999, y: 99999 }]) {
      await pet.evaluate((position) => window.xiaohei.config.update({ window: position }), position);
      await pet.evaluate(() => window.xiaohei.pet.openActions());
      expect(await app.evaluate(({ BrowserWindow, screen }) => {
        const bounds = BrowserWindow.getAllWindows().find((window) => window.getTitle() === "罗小黑桌宠动作")!.getBounds();
        const work = screen.getDisplayMatching(bounds).workArea;
        return bounds.x >= work.x && bounds.y >= work.y && bounds.x + bounds.width <= work.x + work.width + 1 && bounds.y + bounds.height <= work.y + work.height + 1;
      })).toBe(true);
    }
    await pet.evaluate(() => window.xiaohei.app.openSettings());
    const settings = app.windows().find((window) => window.url().includes("settings.html"))!;
    await expect(settings.getByRole("heading", { name: "罗小黑桌宠设置" })).toBeVisible();
    await expect(settings.getByRole("heading", { name: "动作", exact: true })).toHaveCount(0);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.getTitle() === "罗小黑桌宠动作")!.isVisible())).toBe(false);
  } finally {
    await app.close();
  }
});
