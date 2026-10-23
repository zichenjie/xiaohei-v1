import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";

async function readyPet(app: ElectronApplication): Promise<Page> {
  await protectTestWindows(app);
  const pet = await app.firstWindow();
  await expect(pet.locator("canvas")).toBeVisible();
  await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
  return pet;
}

async function openStatus(app: ElectronApplication, pet: Page): Promise<Page> {
  await pet.evaluate(() => window.xiaohei.status.open());
  const page = app.windows().find((page) => page.url().includes("status.html"))!;
  await expect(page.getByRole("heading", { name: "罗小黑的状态" })).toBeVisible();
  return page;
}

test("status opens from the pet menu, shows live values and stays absent when closed", async ({}, testInfo) => {
  test.setTimeout(60000);
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    const pet = await readyPet(app);
    const root = pet.locator(".pet-root");
    expect(app.windows().some((p) => p.url().includes("status.html"))).toBe(false);
    await app.evaluate(({ Menu }) => {
      Menu.prototype.popup = function (options) {
        (globalThis as any).__statusMenu = this;
        options?.callback?.();
      };
    });
    await pet.locator(".pet-hit-area").click({ button: "right" });
    await app.evaluate(() => {
      const item = (globalThis as any).__statusMenu.items.find((i: any) => i.label === "查看状态");
      if (!item) throw new Error("Missing status menu entry");
      item.click(item, undefined, {});
    });
    await expect.poll(() => app.windows().some((p) => p.url().includes("status.html"))).toBe(true);
    let status = app.windows().find((p) => p.url().includes("status.html"))!;
    await expect(status.getByRole("meter", { name: "心情", exact: true })).toBeVisible();
    for (const [name, key] of [["心情", "mood"], ["精力", "energy"]] as const) {
      const actual = Number(await root.getAttribute(`data-${key}`));
      expect(Number(await status.getByRole("meter", { name, exact: true }).getAttribute("aria-valuenow"))).toBeCloseTo(actual, 0);
    }
    const before = Number(await status.getByRole("meter", { name: "心情", exact: true }).getAttribute("aria-valuenow"));
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Pat"));
    await expect.poll(async () => Number(await status.getByRole("meter", { name: "心情", exact: true }).getAttribute("aria-valuenow"))).toBeGreaterThan(before + 0.8);
    await expect(root).toHaveAttribute("data-action", "Idle", { timeout: 10000 });
    await status.screenshot({ path: testInfo.outputPath("pet-status.png") });
    expect(await status.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    await status.getByRole("button", { name: "关闭", exact: true }).click();
    await expect.poll(() => app.windows().some((p) => p.url().includes("status.html"))).toBe(false);
    expect(await pet.getByText("心情", { exact: true }).count()).toBe(0);
    status = await openStatus(app, pet);
    for (const state of ["minimized", "hidden", "offscreen"] as const) {
      await app.evaluate(({ BrowserWindow }, state) => {
        const window = BrowserWindow.getAllWindows().find((w) => w.getTitle() === "罗小黑的状态")!;
        if (state === "minimized") window.minimize();
        if (state === "hidden") window.hide();
        if (state === "offscreen") window.setPosition(-10000, -10000);
      }, state);
      await openStatus(app, pet);
      await expect.poll(() => app.evaluate(({ BrowserWindow, screen }) => {
        const windows = BrowserWindow.getAllWindows().filter((w) => w.getTitle() === "罗小黑的状态");
        const window = windows[0], b = window.getBounds(), a = screen.getDisplayMatching(b).workArea;
        return { count: windows.length, visible: window.isVisible(), minimized: window.isMinimized(), focused: window.isFocused(), top: window.isAlwaysOnTop(),
          onScreen: b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width + 1 && b.y + b.height <= a.y + a.height + 1 };
      })).toEqual({ count: 1, visible: true, minimized: false, focused: true, top: true, onScreen: true });
    }
    await status.keyboard.press("Escape").catch((error) => {
      // Closing on keydown can destroy the page before CDP sends keyup.
      if (!status.isClosed()) throw error;
    });
    await expect.poll(() => app.windows().some((p) => p.url().includes("status.html"))).toBe(false);
    await openStatus(app, pet);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === "罗小黑的状态")!.close());
    await expect.poll(() => app.windows().some((p) => p.url().includes("status.html"))).toBe(false);
    await pet.waitForTimeout(1500);
    expect(app.windows().some((p) => p.url().includes("status.html"))).toBe(false);
  } finally { await app.close(); }
});

test("viewing status neither wakes a sleeping pet nor rewards it, and shows energy recovery", async () => {
  test.setTimeout(60000);
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    const pet = await readyPet(app);
    await pet.addInitScript(() => localStorage.setItem("xiaohei.companion.v1", JSON.stringify({ energy: 25, mood: 85, updatedAt: Date.now() })));
    await pet.reload();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Sleep"));
    const root = pet.locator(".pet-root");
    await expect(root).toHaveAttribute("data-behavior-state", "sleeping");
    const moodBefore = Number(await root.getAttribute("data-mood"));
    const status = await openStatus(app, pet);
    await expect(status.getByText("正在睡觉，慢慢恢复精力", { exact: true })).toBeVisible();
    await expect(status.getByText("需要休息", { exact: true })).toBeVisible();
    await expect(status.getByText("很开心", { exact: true })).toBeVisible();
    const energy = Number(await status.getByRole("meter", { name: "精力", exact: true }).getAttribute("aria-valuenow"));
    await expect.poll(async () => Number(await status.getByRole("meter", { name: "精力", exact: true }).getAttribute("aria-valuenow")), { timeout: 6000 }).toBeGreaterThan(energy + 0.2);
    expect(Number(await root.getAttribute("data-mood"))).toBeLessThanOrEqual(moodBefore);
    await status.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(root).toHaveAttribute("data-behavior-state", "sleeping");
    await expect(root).toHaveAttribute("data-action", "Sleep");
    await openStatus(app, pet);
    expect((await pet.evaluate(() => window.xiaohei.companion.context())).blocked).toBe(true);
    await pet.evaluate(() => window.xiaohei.pet.setVisibility(false));
    await expect.poll(() => app.windows().some((p) => p.url().includes("status.html"))).toBe(false);
    await pet.evaluate(() => window.xiaohei.pet.setVisibility(true));
    expect(app.windows().some((p) => p.url().includes("status.html"))).toBe(false);
    await expect(root).toHaveAttribute("data-behavior-state", "sleeping");
  } finally { await app.close(); }
});

test("status rejects forged data and gives way to settings and the action menu", async () => {
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    const pet = await readyPet(app);
    let status = await openStatus(app, pet);
    await status.evaluate(async () => {
      window.xiaohei.status.publish({ energy: 0, mood: 0, activity: "sleeping" });
      const snapshot = await window.xiaohei.status.get();
      if (!snapshot || snapshot.energy < 50 || snapshot.activity === "sleeping") throw new Error("Status window overwrote pet state");
    });
    await pet.evaluate(async () => {
      for (const bad of [NaN, Infinity, -1, 101]) {
        window.xiaohei.status.publish({ energy: bad, mood: 0, activity: "sleeping" });
        const snapshot = await window.xiaohei.status.get();
        if (!snapshot || snapshot.energy < 50 || snapshot.activity === "sleeping") throw new Error("Invalid status accepted");
      }
    });
    await pet.evaluate(() => window.xiaohei.app.openSettings());
    await expect.poll(() => app.windows().some((p) => p.url().includes("status.html"))).toBe(false);
    await expect(app.windows().find((p) => p.url().includes("settings.html"))!.getByRole("heading", { name: "罗小黑桌宠设置" })).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === "罗小黑桌宠设置")!.close());
    status = await openStatus(app, pet);
    await expect(status.getByRole("meter", { name: "精力", exact: true })).toBeVisible();
    await pet.evaluate(() => window.xiaohei.pet.openActions());
    await expect.poll(() => app.windows().some((p) => p.url().includes("status.html"))).toBe(false);
    await expect(app.windows().find((p) => p.url().includes("actions.html"))!.getByRole("button", { name: "睡觉", exact: true })).toBeVisible();
  } finally { await app.close(); }
});
