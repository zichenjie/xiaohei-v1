import { _electron as electron, expect, test, type Locator } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { createTestProfile, protectTestWindows } from "./profile.js";

// Settings acknowledge updates through IPC; React can restore the old checked
// property until that acknowledgement arrives, after the input click completes.
async function setCheckbox(checkbox: Locator, checked: boolean) {
  if (await checkbox.isChecked() !== checked) await checkbox.click();
  await expect(checkbox).toBeChecked({ checked });
}

test("full desktop pet functionality audit", async ({}, testInfo) => {
  test.setTimeout(180000);
  const profile = createTestProfile();
  const configPath = profile.configPath;
  const app = await electron.launch(profile.launchOptions);
  await protectTestWindows(app);
  const findings: string[] = [];
  const logs: string[] = [];
  try {
    const pet = await app.firstWindow();
    pet.on("console", (message) => logs.push(message.text()));
    const errors: string[] = [];
    pet.on("pageerror", (error) => errors.push(error.message));
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await pet.evaluate(() => window.xiaohei.config.update({
      window: { visible: true, locked: false, clickThrough: false, scale: 1 },
      pet: { behaviorMode: "quiet", followMouse: false }
    }));

    await test.step("window properties and settings singleton", async () => {
      const properties = await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        return { frame: window.hasShadow(), resizable: window.isResizable(), size: window.getSize() };
      });
      expect(properties.frame).toBe(false);
      expect(properties.resizable).toBe(false);
      expect(properties.size).toEqual([360, 520]);
      await expect(pet.locator(".pet-debug-frame")).toHaveCount(0);
      expect(await pet.locator(".pet-root").evaluate((node) => getComputedStyle(node).borderWidth)).toBe("0px");
      await pet.evaluate(() => window.xiaohei.app.openSettings());
      await pet.evaluate(() => window.xiaohei.app.openSettings());
      await expect.poll(() => app.windows().length).toBe(2);
    });
    const settings = app.windows().find((page) => page !== pet)!;
    await expect(settings.getByRole("heading", { name: "罗小黑桌宠设置" })).toBeVisible();
    await expect(settings.getByRole("heading", { name: "动作", exact: true })).toHaveCount(0);
    const triggerFromFan = async (label: string) => {
      await pet.evaluate(() => window.xiaohei.pet.openActions());
      const fan = app.windows().find((page) => page.url().includes("actions.html"))!;
      await fan.getByRole("button", { name: label, exact: true }).click();
      if (label === "移动") await fan.getByRole("button", { name: "← 向左走", exact: true }).click();
    };

    await test.step("all settings controls and window scaling limits", async () => {
      for (const label of ["鼠标跟随", "始终置顶", "锁定位置", "鼠标穿透"]) {
        const checkbox = settings.getByRole("checkbox", { name: label, exact: true });
        await setCheckbox(checkbox, true);
        await expect(checkbox).toBeChecked();
        await setCheckbox(checkbox, false);
        await expect(checkbox).not.toBeChecked();
      }
      for (const name of ["活泼", "安静"]) {
        await settings.getByRole("group", { name: "行为模式", exact: true }).getByRole("button", { name, exact: true }).click();
        await expect(settings.getByRole("group", { name: "行为模式", exact: true }).getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
      }
      for (const scale of [0.4, 2, 1]) {
        await pet.evaluate((scale) => window.xiaohei.config.update({ window: { scale } }), scale);
        await expect.poll(async () => {
          const size = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("/index.html"))!.getSize());
          return Math.max(Math.abs(size[0] - Math.round(360 * scale)), Math.abs(size[1] - Math.round(520 * scale)));
        }).toBe(0);
        await expect(settings.locator("output")).toHaveText(`${scale * 100}%`);
      }
      const clamped = await pet.evaluate(() => window.xiaohei.config.update({ window: { scale: 99 } }));
      expect(clamped.window.scale).toBe(2);
      await pet.evaluate(() => window.xiaohei.config.update({ window: { scale: 1 } }));
    });

    await test.step("every action button reaches the Live2D runtime", async () => {
      const actions: Array<[string, string, number]> = [
        ["待机", "Idle", 0], ["弹跳", "Bounce", 1.8], ["睡觉", "Sleep", 0],
        ["打招呼", "Greet", 2.8], ["好奇", "Curious", 2.6], ["开心", "Happy", 3],
        ["摸头", "Pat", 2.4], ["移动", "Move", 2.4], ["头发换色", "hair", 0]
      ];
      for (const [label, action, duration] of actions) {
        const start = logs.length;
        const startedAt = Date.now();
        await triggerFromFan(label);
        await expect.poll(() => logs.slice(start).some((line) => line.includes(
          action === "hair" ? "expression hair: applied" : `motion ${action}: started`
        )), { message: `${label} should start in Live2D` }).toBe(true);
        await pet.waitForTimeout(duration ? duration * 500 : 300);
        await pet.screenshot({ path: testInfo.outputPath(`action-${action}.png`) });
        if (duration) {
          await expect.poll(() => logs.slice(start).some((line) => line.includes(`motion ${action}: finished`)), {
            message: `${label} should play to completion`, timeout: 9000
          }).toBe(true);
          expect(Date.now() - startedAt).toBeGreaterThanOrEqual(duration * 1000 - 200);
          await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Idle", { timeout: 3000 });
        }
      }
      await triggerFromFan("待机");
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-behavior-state", "idle");
    });

    await test.step("click, double click, drag, and lock interaction", async () => {
      // Reload between scenarios so each starts from the same state machine state.
      const reset = async () => {
        await pet.evaluate(() => window.xiaohei.pet.triggerAction("Idle"));
        await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
        await expect(pet.locator("canvas")).toBeVisible();
      };
      await reset();
      await pet.locator(".pet-hit-area").click();
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", /HeadTouch|CheekLeft|CheekRight|BodyTouch/);
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Idle", { timeout: 6000 });
      await pet.locator(".pet-hit-area").dblclick();
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Happy");
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Idle", { timeout: 6000 });
      const before = await pet.evaluate(() => window.xiaohei.config.get());
      const target = pet.locator(".pet-hit-area");
      const box = (await target.boundingBox())!;
      await pet.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await pet.mouse.down();
      await pet.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2 - 30);
      await pet.mouse.up();
      await expect.poll(async () => (await pet.evaluate(() => window.xiaohei.config.get())).window.x).not.toBe(before.window.x);
      const after = await pet.evaluate(() => window.xiaohei.config.get());
      expect(after.window.x).not.toBe(before.window.x);
      await reset();
      await setCheckbox(settings.getByRole("checkbox", { name: "锁定位置", exact: true }), true);
      await target.click();
      await pet.waitForTimeout(400);
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", /HeadTouch|CheekLeft|CheekRight|BodyTouch/);
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-behavior-state", "idle", { timeout: 6000 });
      const lockedPosition = await pet.evaluate(() => window.xiaohei.config.get());
      await pet.mouse.down();
      await pet.mouse.move(80, 80);
      await pet.mouse.up();
      const stillLocked = await pet.evaluate(() => window.xiaohei.config.get());
      expect([stillLocked.window.x, stillLocked.window.y]).toEqual([lockedPosition.window.x, lockedPosition.window.y]);
      await setCheckbox(settings.getByRole("checkbox", { name: "锁定位置", exact: true }), false);
    });

    await test.step("visibility, reset position, and saved config reload", async () => {
      await pet.evaluate(() => window.xiaohei.pet.setVisibility(false));
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("/index.html"))!.isVisible())).toBe(false);
      await pet.evaluate(() => window.xiaohei.pet.setVisibility(true));
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("/index.html"))!.isVisible())).toBe(true);
      const config = await pet.evaluate(() => window.xiaohei.pet.resetPosition());
      expect(config.window.x).toEqual(expect.any(Number));
      expect(config.window.y).toEqual(expect.any(Number));
      expect(JSON.parse(readFileSync(configPath, "utf8")).config.window.x).toBe(config.window.x);
      await settings.reload();
      await expect(settings.getByRole("checkbox", { name: "鼠标跟随", exact: true })).not.toBeChecked();
    });

    await test.step("actual gaze returns to neutral when disabled", async () => {
      const gaze = () => pet.evaluate(() => {
        let listener = (window as any).PIXI.Ticker.shared._head.next;
        while (listener) {
          const controller = listener.context?.internalModel?.focusController;
          if (controller) return { x: controller.x, y: controller.y };
          listener = listener.next;
        }
        return null;
      });
      await setCheckbox(settings.getByRole("checkbox", { name: "鼠标跟随", exact: true }), true);
      await pet.mouse.move(30, 30);
      await expect.poll(async () => {
        const point = await gaze();
        return point ? Math.abs(point.x) + Math.abs(point.y) : 0;
      }).toBeGreaterThan(0.1);
      await setCheckbox(settings.getByRole("checkbox", { name: "鼠标跟随", exact: true }), false);
      await expect.poll(gaze).toEqual({ x: 0, y: 0 });
    });

    await test.step("tray menu callbacks and settings synchronization", async () => {
      await app.evaluate(({ Menu }) => {
        const originalBuild = Menu.buildFromTemplate;
        Menu.buildFromTemplate = (template) => {
          const menu = originalBuild(template);
          (globalThis as any).__auditMenu = menu;
          return menu;
        };
      });
      await pet.evaluate(() => window.xiaohei.config.update({ pet: { behaviorMode: "quiet" } }));
      const labels = await app.evaluate(() => (globalThis as any).__auditMenu.items.map((item: any) => item.label));
      expect(labels).toEqual(expect.arrayContaining(["隐藏桌宠", "打开设置", "回到默认位置", "安静模式", "活泼模式", "锁定位置", "鼠标穿透", "开机自启", "退出"]));
      for (const label of ["活泼模式", "安静模式", "回到默认位置", "隐藏桌宠", "显示桌宠", "打开设置"]) {
        await app.evaluate(({}, label) => {
          const menu = (globalThis as any).__auditMenu;
          const item = menu.items.find((item: any) => item.label === label);
          item.click(item, undefined, {});
        }, label);
      }
      await expect(settings.getByRole("group", { name: "行为模式", exact: true }).getByRole("button", { name: "安静", exact: true })).toHaveAttribute("aria-pressed", "true");
    });

    await test.step("idle timers and interrupted action conflicts", async () => {
      await pet.evaluate(() => window.xiaohei.config.update({ pet: { behaviorMode: "active" } }));
      await pet.evaluate(() => window.xiaohei.pet.triggerAction("Idle"));
      await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
      // Timed assertions must not receive physical mouse input from the desktop.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.hide()));
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "IdleVariant", { timeout: 16000 });
      await pet.evaluate(() => window.xiaohei.config.update({ pet: { behaviorMode: "quiet" } }));
      await pet.evaluate(() => window.xiaohei.pet.triggerAction("Idle"));
      await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.hide()));
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "IdleVariant", { timeout: 32000 });
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => {
        if (window.getTitle() !== "罗小黑桌宠动作") window.show();
      }));
      await triggerFromFan("打招呼");
      await pet.waitForTimeout(150);
      const start = logs.length;
      await triggerFromFan("睡觉");
      await pet.waitForTimeout(2000);
      expect(logs.slice(start).some((line) => line.includes("motion Idle: started"))).toBe(false);
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Sleep");
      await pet.evaluate(() => window.xiaohei.pet.triggerAction("Idle"));
      await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
      await pet.locator(".pet-hit-area").click();
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", /HeadTouch|CheekLeft|CheekRight|BodyTouch/);
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-behavior-state", "cooldown", { timeout: 6000 });
      await triggerFromFan("睡觉");
      await pet.waitForTimeout(1000);
      const sleepingBox = (await pet.locator(".pet-hit-area").boundingBox())!;
      await pet.locator(".pet-hit-area").click({ position: { x: sleepingBox.width * 0.5, y: sleepingBox.height * 0.4 } });
      await pet.waitForTimeout(400);
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Wake");
    });

    await test.step("autostart wiring without modifying Windows startup", async () => {
      await app.evaluate(({ app }) => {
        let enabled = false;
        app.setLoginItemSettings = (options) => { enabled = Boolean(options.openAtLogin); };
        app.getLoginItemSettings = (() => ({ openAtLogin: enabled })) as typeof app.getLoginItemSettings;
      });
      const checkbox = settings.getByRole("checkbox", { name: "开机自启", exact: true });
      await setCheckbox(checkbox, true);
      expect((await pet.evaluate(() => window.xiaohei.config.get())).system.autoLaunch).toBe(true);
      await setCheckbox(checkbox, false);
      expect((await pet.evaluate(() => window.xiaohei.config.get())).system.autoLaunch).toBe(false);
    });
    expect(errors).toEqual([]);
    await pet.screenshot({ path: testInfo.outputPath("pet.png") });
    await settings.screenshot({ path: testInfo.outputPath("settings.png") });
    await testInfo.attach("findings", { body: JSON.stringify({ findings, errors, logs }, null, 2), contentType: "application/json" });
    writeFileSync(testInfo.outputPath("audit.json"), JSON.stringify({ findings, errors, logs }, null, 2));
    await test.step("quit IPC exits the process", async () => {
      const closed = app.waitForEvent("close");
      await settings.evaluate(() => { void window.xiaohei.app.quit(); }).catch(() => {});
      await closed;
    });
  } finally {
    writeFileSync(testInfo.outputPath("audit-log.json"), JSON.stringify({ findings, logs }, null, 2));
    await testInfo.attach("audit-log", { body: JSON.stringify({ findings, logs }, null, 2), contentType: "application/json" });
    await app.close().catch(() => {});
  }
});

test("model loading failure recovers and settings persist after restart", async () => {
  test.setTimeout(60000);
  const profile = createTestProfile();
  let app = await electron.launch(profile.launchOptions);
  try {
    let pet = await app.firstWindow();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    const config = await pet.evaluate(() => window.xiaohei.config.get());
    await pet.evaluate(() => window.xiaohei.config.update({ pet: { modelPath: "missing.model3.json" } }));
    await expect(pet.locator(".pet-error")).toContainText("模型加载失败", { timeout: 20000 });
    await pet.evaluate((modelPath) => window.xiaohei.config.update({ pet: { modelPath, followMouse: false, behaviorMode: "active" } }), config.pet.modelPath);
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await app.close();
    app = await electron.launch(profile.launchOptions);
    pet = await app.firstWindow();
    const reloaded = await pet.evaluate(() => window.xiaohei.config.get());
    expect(reloaded.pet.followMouse).toBe(false);
    expect(reloaded.pet.behaviorMode).toBe("active");
    expect(reloaded.pet.modelPath).toBe(config.pet.modelPath);
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
  } finally {
    await app.close().catch(() => {});
  }
});
