import { _electron as electron, expect, test, type Page, type ElectronApplication } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";

async function ready(pet: Page) {
  await expect(pet.locator("canvas")).toBeVisible();
  await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
}

async function prepare(app: ElectronApplication, energy = 75, lastKind = "touch", misses = 0) {
  await protectTestWindows(app);
  await app.evaluate(({ powerMonitor }) => { powerMonitor.getSystemIdleTime = () => 0; });
  const pet = await app.firstWindow(); await ready(pet);
  // Advance only the wall clock, in sub-suspend-sized increments. Cubism and
  // animation transitions continue to run on real requestAnimationFrame time.
  await pet.addInitScript(({ energy, lastKind, misses }) => {
    const original = Date.now.bind(Date);
    (window as any).__autonomyOffset = 0;
    Date.now = () => original() + (window as any).__autonomyOffset;
    const now = Date.now();
    localStorage.setItem("xiaohei.companion.v1", JSON.stringify({ energy, mood: 65, updatedAt: now }));
    localStorage.setItem("xiaohei.autonomy.v1", JSON.stringify({ lastInteractionAt: now - 25 * 60000,
      nextInviteAt: now - 1, nextObserveAt: now + 3600000, misses, invitations: [], lastKind }));
  }, { energy, lastKind, misses });
  await pet.reload(); await ready(pet);
  await pet.evaluate(() => window.xiaohei.config.update({ pet: { followMouse: false, initiative: "balanced", autoRest: true, quietUntil: 0 } }));
  return pet;
}

async function advance(pet: Page, steps = 6) {
  for (let i = 0; i < steps; i++) {
    await pet.evaluate(() => { (window as any).__autonomyOffset += 10000; });
    await pet.waitForTimeout(1100);
  }
}

async function points(pet: Page) {
  return pet.evaluate(() => {
    let l = (window as any).PIXI.Ticker.shared._head.next;
    while (!l.context?.internalModel) l = l.next;
    const m = l.context, i = m.internalModel;
    const rect = document.querySelector(".pet-hit-area")!.getBoundingClientRect();
    const target = (id: string, y: number) => {
      const b = i.getDrawableBounds(i.coreModel.getDrawableIndex(id));
      const p = m.toGlobal(i.localTransform.apply({ x: b.x + b.width * 0.5, y: b.y + b.height * y }));
      return { x: p.x + rect.left, y: p.y + rect.top };
    };
    return { head: target("ArtMesh58", 0.25), body: target("ArtMesh46", 0.65) };
  });
}

async function memory(pet: Page) {
  return pet.evaluate(() => {
    window.dispatchEvent(new Event("pagehide"));
    return JSON.parse(localStorage.getItem("xiaohei.autonomy.v1")!);
  });
}

for (const response of ["accept", "touch", "ignore", "busy"] as const) {
  test(`autonomous invitation: ${response}, actual bubble, no focus theft and remembered response`, async ({}, info) => {
    test.setTimeout(65000);
    const profile = createTestProfile();
    let app = await electron.launch(profile.launchOptions);
    try {
      const pet = await prepare(app, 75, response === "touch" ? "play" : "touch", response === "touch" ? 1 : 0);
      await pet.evaluate((scale) => window.xiaohei.config.update({ window: { scale } }), response === "accept" ? 0.4 : 1.4);
      const probeId = await app.evaluate(async ({ BrowserWindow, screen }) => {
        const work = screen.getPrimaryDisplay().workArea;
        const probe = new BrowserWindow({ x: work.x + 20, y: work.y + 20, width: 220, height: 80,
          show: false, frame: false, skipTaskbar: true, title: "Companion focus test" });
        // This is a focus target, not an editor. Declare and encode UTF-8 so a
        // visible test fixture never displays mojibake or accepts user text.
        const html = "<!doctype html><html lang='zh-CN'><meta charset='utf-8'><title>Companion focus test</title><body style='margin:14px;font:13px sans-serif;background:#f7fbf5'>临时焦点检查<br>检查完成后自动关闭</body></html>";
        await probe.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        // Also clean up if an assertion or the test runner stalls.
        const cleanup = setTimeout(() => { if (!probe.isDestroyed()) probe.destroy(); }, 20000);
        cleanup.unref();
        probe.once("closed", () => clearTimeout(cleanup));
        return probe.id;
      });
      let bubble: Page;
      try {
        const probePage = app.windows().find((p) => p.url().startsWith("data:text/html;charset=utf-8,"))!;
        expect(await probePage.evaluate(() => document.characterSet)).toBe("UTF-8");
        await expect(probePage.locator("body")).toHaveText("临时焦点检查检查完成后自动关闭");
        await expect(probePage.locator("input, textarea, [contenteditable]")).toHaveCount(0);
        await app.evaluate(({ BrowserWindow }, id) => {
          const probe = BrowserWindow.fromId(id)!;
          probe.show(); probe.focus();
        }, probeId);
        await expect.poll(() => app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.isFocused(), probeId)).toBe(true);
        await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.isFocused())).toBe(false);
        await probePage.screenshot({ path: info.outputPath("focus-probe.png") });
        await advance(pet);
        await expect(pet.locator(".pet-root")).toHaveAttribute("data-autonomy", "inviting", { timeout: 5000 });
        await expect.poll(() => app.windows().some((p) => p.url().includes("companion.html"))).toBe(true);
        bubble = app.windows().find((p) => p.url().includes("companion.html"))!;
        await expect(bubble.getByRole("button", { name: "先忙", exact: true })).toBeVisible();
        expect(await app.evaluate(({ BrowserWindow, screen }) => {
          const b = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("companion.html"))!;
          const r = b.getBounds(), work = screen.getDisplayMatching(r).workArea;
          return { focusable: b.isFocusable(), focused: b.isFocused(), petFocused: BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.isFocused(), inside: r.x >= work.x && r.y >= work.y && r.x + r.width <= work.x + work.width && r.y + r.height <= work.y + work.height };
        })).toEqual({ focusable: false, focused: false, petFocused: false, inside: true });
      } finally {
        await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(), probeId);
      }
      expect(await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id) === null, probeId)).toBe(true);
      await bubble.screenshot({ path: info.outputPath(`invitation-${response}.png`) });
      if (response === "accept") {
        await bubble.getByRole("button", { name: "陪你玩", exact: true }).click();
        await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Happy");
        await expect(bubble.getByText("嘿嘿，有你陪着真好。", { exact: true })).toBeVisible();
        await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Idle", { timeout: 6000 });
      } else if (response === "touch") {
        const p = await points(pet); await pet.mouse.move(p.head.x, p.head.y); await pet.mouse.down();
        await expect(pet.locator(".pet-root")).toHaveAttribute("data-behavior-state", "stroking");
        await expect(bubble.getByText("嘿嘿，有你陪着真好。", { exact: true })).toBeVisible();
        await pet.waitForTimeout(500); await pet.mouse.up();
      } else if (response === "busy") {
        await bubble.getByRole("button", { name: "先忙", exact: true }).click();
        await expect(bubble.getByText("好，我安静陪着你。", { exact: true })).toBeVisible();
        await expect.poll(() => pet.evaluate(async () => (await window.xiaohei.config.get()).pet.quietUntil)).toBeGreaterThan(Date.now() + 3500000);
      } else {
        await expect(pet.locator(".pet-root")).toHaveAttribute("data-autonomy", "quiet", { timeout: 10000 });
      }
      const stored = await memory(pet);
      expect(stored.misses).toBe(response === "ignore" ? 1 : 0);
      expect(stored.invitations).toHaveLength(1);
      if (response === "ignore") expect(stored.nextInviteAt - await pet.evaluate(() => Date.now())).toBeGreaterThan(29 * 60000);
      await advance(pet, 2);
      await expect(pet.locator(".pet-root")).not.toHaveAttribute("data-autonomy", "inviting");
      if (response === "busy" || response === "ignore") {
        await app.close(); app = await electron.launch(profile.launchOptions);
        await protectTestWindows(app);
        const restarted = await app.firstWindow(); await ready(restarted);
        expect((await memory(restarted)).misses).toBe(stored.misses);
        await expect(restarted.locator(".pet-root")).not.toHaveAttribute("data-autonomy", "inviting");
        if (response === "busy") {
          await restarted.evaluate(() => window.xiaohei.app.openSettings());
          const settings = app.windows().find((p) => p.url().includes("settings.html"))!;
          await expect(settings.getByRole("button", { name: "恢复主动邀请", exact: true })).toBeVisible();
          await settings.getByRole("button", { name: "恢复主动邀请", exact: true }).click();
          await expect.poll(() => restarted.evaluate(async () => (await window.xiaohei.config.get()).pet.quietUntil)).toBe(0);
          await expect.poll(async () => {
            const m = await memory(restarted);
            const remaining = m.nextInviteAt - Date.now();
            return remaining > 9.9 * 60000 && remaining <= 15 * 60000;
          }).toBe(true);
        }
      }
    } finally { await app.close(); }
  });
}

test("tired pet settles smoothly, sleeps through hover/body clicks/system resume, and wakes on head click", async ({}, info) => {
  test.setTimeout(60000);
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    const pet = await prepare(app, 25);
    await pet.evaluate(() => {
      let l = (window as any).PIXI.Ticker.shared._head.next;
      while (!l.context?.internalModel) l = l.next;
      const i = l.context.internalModel;
      (window as any).__sleepFrames = [];
      i.on("beforeModelUpdate", () => {
        (window as any).__sleepFrames.push({ time: performance.now(), action: document.querySelector(".pet-root")!.getAttribute("data-action"), eye: i.coreModel.getParameterValueById("ParamEyeLOpen") });
      });
    });
    await advance(pet);
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Settle");
    await pet.waitForTimeout(2200);
    await pet.screenshot({ path: info.outputPath("settling.png") });
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-behavior-state", "sleeping", { timeout: 6000 });
    await pet.waitForTimeout(700);
    const frames = await pet.evaluate(() => (window as any).__sleepFrames as Array<{ time: number; action: string; eye: number }>);
    const settle = frames.filter((f) => f.action === "Settle");
    expect(settle.length).toBeGreaterThan(20);
    expect(settle.at(-1)!.eye).toBeLessThan(0.08);
    const closed = frames.filter((f) => f.time >= settle.at(-1)!.time);
    expect(Math.max(...closed.map((f) => f.eye))).toBeLessThan(0.15);
    await info.attach("sleep-transition", { body: JSON.stringify(frames), contentType: "application/json" });
    const p = await points(pet);
    await pet.mouse.move(p.head.x, p.head.y); await pet.mouse.click(p.body.x, p.body.y); await pet.waitForTimeout(600);
    await app.evaluate(({ powerMonitor }) => { powerMonitor.emit("suspend"); powerMonitor.emit("resume"); });
    await pet.waitForTimeout(1400);
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-behavior-state", "sleeping");
    await pet.screenshot({ path: info.outputPath("autonomous-sleep.png") });
    await pet.mouse.click(p.head.x, p.head.y);
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Wake");
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Idle", { timeout: 6000 });
    await pet.waitForTimeout(2000);
    await expect(pet.locator(".pet-root")).not.toHaveAttribute("data-behavior-state", "sleeping");
  } finally { await app.close(); }
});

test("touch interrupts pending rest; disabled auto-rest and quiet preference persist", async () => {
  test.setTimeout(60000);
  const profile = createTestProfile();
  let app = await electron.launch(profile.launchOptions);
  try {
    const pet = await prepare(app, 25);
    await advance(pet);
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Settle");
    const p = await points(pet); await pet.mouse.click(p.head.x, p.head.y);
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "HeadTouch");
    await pet.waitForTimeout(6000);
    await expect(pet.locator(".pet-root")).not.toHaveAttribute("data-behavior-state", "sleeping");
    await pet.evaluate(() => window.xiaohei.app.openSettings());
    const settings = app.windows().find((p) => p.url().includes("settings.html"))!;
    await settings.getByRole("checkbox", { name: "累了自己休息", exact: true }).click();
    await expect(settings.getByRole("checkbox", { name: "累了自己休息", exact: true })).not.toBeChecked();
    await settings.getByRole("group", { name: "主动程度", exact: true }).getByRole("button", { name: "安静", exact: true }).click();
    await expect.poll(() => pet.evaluate(async () => (await window.xiaohei.config.get()).pet.initiative)).toBe("quiet");
    await app.close(); app = await electron.launch(profile.launchOptions);
    const restarted = await app.firstWindow(); await ready(restarted);
    expect((await restarted.evaluate(() => window.xiaohei.config.get())).pet).toMatchObject({ initiative: "quiet", autoRest: false });
  } finally { await app.close(); }
});

test("settings, hidden/click-through windows, system idle and lock suppress invitations and stale replies", async () => {
  test.setTimeout(80000);
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    const pet = await prepare(app);
    await pet.evaluate(() => window.xiaohei.app.openSettings());
    await advance(pet);
    await expect(pet.locator(".pet-root")).not.toHaveAttribute("data-autonomy", "inviting");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("settings.html"))!.hide());
    await pet.evaluate(() => window.xiaohei.pet.setClickThrough(true)); await advance(pet);
    await expect(pet.locator(".pet-root")).not.toHaveAttribute("data-autonomy", "inviting");
    await pet.evaluate(async () => { await window.xiaohei.pet.setClickThrough(false); await window.xiaohei.pet.setVisibility(false); }); await advance(pet);
    await expect(pet.locator(".pet-root")).not.toHaveAttribute("data-autonomy", "inviting");
    await pet.evaluate(() => window.xiaohei.pet.setVisibility(true));
    await app.evaluate(({ powerMonitor }) => { powerMonitor.getSystemIdleTime = () => 600; }); await advance(pet);
    await expect(pet.locator(".pet-root")).not.toHaveAttribute("data-autonomy", "inviting");
    await app.evaluate(({ powerMonitor }) => { powerMonitor.getSystemIdleTime = () => 0; });
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-autonomy", "inviting", { timeout: 5000 });
    const bubble = app.windows().find((p) => p.url().includes("companion.html"))!;
    const old = await bubble.evaluate(() => window.xiaohei.companion.getBubble());
    await app.evaluate(({ powerMonitor }) => powerMonitor.emit("lock-screen"));
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("companion.html"))!.isVisible())).toBe(false);
    await bubble.evaluate((id) => window.xiaohei.companion.reply({ id, response: "accept" }), old!.id);
    await pet.waitForTimeout(1500);
    await expect(pet.locator(".pet-root")).not.toHaveAttribute("data-action", "Happy");
    expect((await memory(pet)).misses).toBe(0);
    await app.evaluate(({ powerMonitor }) => powerMonitor.emit("unlock-screen"));
    await advance(pet, 2);
    await expect(pet.locator(".pet-root")).not.toHaveAttribute("data-autonomy", "inviting");
  } finally { await app.close(); }
});
