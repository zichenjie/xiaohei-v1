import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";

async function ready(pet: Page) {
  await expect(pet.locator("canvas")).toBeVisible();
  await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
  await pet.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function targets(pet: Page) {
  return pet.evaluate(() => {
    let l = (window as any).PIXI.Ticker.shared._head.next;
    while (!l.context?.internalModel) l = l.next;
    const m = l.context, i = m.internalModel;
    const h = i.getDrawableBounds(i.coreModel.getDrawableIndex("ArtMesh58"));
    const b = i.getDrawableBounds(i.coreModel.getDrawableIndex("ArtMesh46"));
    const rect = document.querySelector(".pet-hit-area")!.getBoundingClientRect();
    const position = (bounds: any, x: number, y: number) => {
      const p = m.toGlobal(i.localTransform.apply({ x: bounds.x + bounds.width * x, y: bounds.y + bounds.height * y }));
      return { x: p.x + rect.left, y: p.y + rect.top };
    };
    return { head: position(h, 0.5, 0.25), cheekLeft: position(h, 0.23, 0.65), cheekRight: position(h, 0.77, 0.65), body: position(b, 0.5, 0.65), width: rect.width };
  });
}
async function observe(pet: Page) {
  await pet.evaluate(() => {
    let l = (window as any).PIXI.Ticker.shared._head.next;
    while (!l.context?.internalModel) l = l.next;
    const i = l.context.internalModel;
    (window as any).__presenceFrames = [];
    i.on("beforeModelUpdate", () => {
      const frames = (window as any).__presenceFrames;
      const values = Object.fromEntries(["ParamAngleX", "ParamAngleY", "ParamAngleZ", "ParamEyeBallX", "ParamEyeLOpen", "ParamEyeROpen", "Paramby"].map((id) => [id, i.coreModel.getParameterValueById(id)]));
      frames.push({ ...values, time: performance.now() });
      if (frames.length > 500) frames.shift();
    });
  });
}
const pose = (pet: Page) => pet.evaluate(() => (window as any).__presenceFrames.at(-1) as Record<string, number>);

test("rendered eyes lead the head, disabling follow settles to neutral, and interrupted poses blend", async ({}, info) => {
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    await protectTestWindows(app);
    const pet = await app.firstWindow(); await ready(pet); await observe(pet);
    await pet.evaluate(() => window.xiaohei.config.update({ pet: { followMouse: false, behaviorMode: "quiet" } }));
    await pet.waitForTimeout(600);
    await app.evaluate(({ screen, BrowserWindow }) => {
      const bounds = BrowserWindow.getAllWindows()[0].getBounds();
      screen.getCursorScreenPoint = () => ({ x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 });
    });
    await pet.evaluate(() => { (window as any).__presenceFrames = []; });
    await pet.evaluate(() => window.xiaohei.config.update({ pet: { followMouse: true } }));
    await pet.waitForTimeout(650);
    const tracking = await pet.evaluate(() => (window as any).__presenceFrames as Array<Record<string, number>>);
    expect(tracking.some((f) => f.ParamEyeBallX / 0.7 - f.ParamAngleX / 20 > 0.15)).toBe(true);
    expect(tracking.at(-1)!.ParamAngleX).toBeGreaterThan(8);
    await pet.evaluate(() => window.xiaohei.config.update({ pet: { followMouse: false } }));
    await expect.poll(async () => Math.abs((await pose(pet)).ParamAngleX)).toBeLessThan(0.01);
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Pat")); await pet.waitForTimeout(800);
    expect((await pose(pet)).ParamEyeLOpen).toBeLessThan(0.1);
    await pet.evaluate(() => { (window as any).__presenceFrames = []; });
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Curious")); await pet.waitForTimeout(650);
    const transition = await pet.evaluate(() => (window as any).__presenceFrames as Array<Record<string, number>>);
    expect(transition.length).toBeGreaterThan(5);
    expect(transition[0].ParamEyeLOpen).toBeLessThan(0.4);
    expect(transition.at(-1)!.ParamEyeLOpen).toBeGreaterThan(0.9);
    for (let i = 1; i < transition.length; i++) {
      if (transition[i].time - transition[i - 1].time < 40) expect(Math.abs(transition[i].ParamEyeLOpen - transition[i - 1].ParamEyeLOpen)).toBeLessThan(0.45);
    }
    await info.attach("rendered-pose-samples", { body: JSON.stringify({ tracking, transition }), contentType: "application/json" });
  } finally { await app.close(); }
});

test("different body areas respond, head strokes follow the hand, and release restores the pose at different sizes", async ({}, info) => {
  test.setTimeout(110000);
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    await protectTestWindows(app);
    const pet = await app.firstWindow(); await ready(pet); await observe(pet);
    const errors: string[] = []; pet.on("pageerror", (e) => errors.push(e.message));
    const root = pet.locator(".pet-root");
    for (const scale of [0.6, 1.4]) {
      await pet.evaluate((scale) => window.xiaohei.config.update({ window: { scale, locked: false }, pet: { followMouse: false, behaviorMode: "quiet" } }), scale);
      await pet.waitForTimeout(500);
      for (const [part, action] of [["head", "HeadTouch"], ["cheekLeft", "CheekLeft"], ["cheekRight", "CheekRight"], ["body", "BodyTouch"]] as const) {
        const p = (await targets(pet))[part]; await pet.mouse.click(p.x, p.y);
        await expect(root).toHaveAttribute("data-action", action);
        await pet.waitForTimeout(600);
        if (part === "cheekLeft") expect((await pose(pet)).ParamEyeLOpen).toBeLessThan((await pose(pet)).ParamEyeROpen);
        if (part === "cheekRight") expect((await pose(pet)).ParamEyeROpen).toBeLessThan((await pose(pet)).ParamEyeLOpen);
        await pet.screenshot({ path: info.outputPath(`${part}-${scale}.png`) });
        await expect(root).toHaveAttribute("data-action", "Idle", { timeout: 5000 });
      }
      const p = await targets(pet);
      const before = await pet.evaluate(() => window.xiaohei.config.get());
      const mood = Number(await root.getAttribute("data-mood"));
      await pet.mouse.move(p.head.x, p.head.y); await pet.mouse.down();
      await expect(root).toHaveAttribute("data-behavior-state", "stroking");
      await pet.waitForTimeout(1300);
      expect((await pose(pet)).ParamEyeLOpen).toBeLessThan(0.3);
      await pet.mouse.move(p.head.x + p.width * 0.12, p.head.y, { steps: 8 }); await pet.waitForTimeout(350);
      expect((await pose(pet)).ParamAngleZ).toBeGreaterThan(1);
      await pet.mouse.move(p.head.x - p.width * 0.12, p.head.y, { steps: 8 }); await pet.waitForTimeout(350);
      expect((await pose(pet)).ParamAngleZ).toBeLessThan(-1);
      await pet.screenshot({ path: info.outputPath(`stroke-${scale}.png`) });
      await expect(pet.locator(".stroke-touch")).toBeVisible();
      await expect(pet.locator(".gesture-hand")).toHaveCount(0);
      const after = await pet.evaluate(() => window.xiaohei.config.get());
      expect([after.window.x, after.window.y]).toEqual([before.window.x, before.window.y]);
      expect(Number(await root.getAttribute("data-mood"))).toBeGreaterThan(mood + 1);
      await pet.mouse.up();
      await expect(root).toHaveAttribute("data-behavior-state", "idle");
      await expect.poll(async () => (await pose(pet)).ParamEyeLOpen).toBeGreaterThan(0.85);
      await expect.poll(async () => Math.abs((await pose(pet)).ParamAngleZ)).toBeLessThan(0.5);
      await expect(pet.locator(".stroke-touch")).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test("stroke cancellation, locked interaction, sleeping and interrupted actions never leave closed eyes", async () => {
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    await protectTestWindows(app);
    const pet = await app.firstWindow(); await ready(pet); await observe(pet);
    await pet.evaluate(() => window.xiaohei.config.update({ window: { locked: true }, pet: { followMouse: false } }));
    const root = pet.locator(".pet-root");
    let p = await targets(pet);
    await pet.mouse.move(p.head.x, p.head.y); await pet.mouse.down();
    await expect(root).toHaveAttribute("data-behavior-state", "stroking");
    await pet.waitForTimeout(900);
    await pet.evaluate(() => window.dispatchEvent(new Event("blur"))); await pet.mouse.up();
    await expect.poll(async () => (await pose(pet)).ParamEyeLOpen).toBeGreaterThan(0.85);
    for (const action of ["Greet", "Pat", "Curious", "Sleep"] as const) {
      await pet.evaluate((action) => window.xiaohei.pet.triggerAction(action), action); await pet.waitForTimeout(450);
    }
    p = await targets(pet);
    await pet.mouse.move(p.head.x, p.head.y); await pet.mouse.down(); await pet.waitForTimeout(600);
    await expect(root).toHaveAttribute("data-behavior-state", "sleeping");
    await pet.mouse.up(); await expect(root).toHaveAttribute("data-action", "Wake");
    await expect(root).toHaveAttribute("data-action", "Idle", { timeout: 5000 });
    p = await targets(pet); await pet.mouse.move(p.head.x, p.head.y); await pet.mouse.down();
    await expect(root).toHaveAttribute("data-behavior-state", "stroking");
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Sleep")); await pet.mouse.up();
    await expect(root).toHaveAttribute("data-behavior-state", "sleeping");
    await expect(pet.locator(".stroke-touch")).toHaveCount(0);
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Idle"));
    await expect.poll(async () => (await pose(pet)).ParamEyeLOpen).toBeGreaterThan(0.85);
    expect((await pose(pet)).Paramby).toBeLessThan(1);
  } finally { await app.close(); }
});

test("low energy produces drowsy activity, sleep recovers energy, and companion state persists", async () => {
  test.setTimeout(45000);
  const profile = createTestProfile();
  let app = await electron.launch(profile.launchOptions);
  try {
    await protectTestWindows(app);
    let pet = await app.firstWindow(); await ready(pet);
    await pet.evaluate(() => {
      window.dispatchEvent(new Event("pagehide"));
      localStorage.setItem("xiaohei.companion.v1", JSON.stringify({ energy: 15, mood: 80, updatedAt: Date.now() }));
    });
    // Prevent the outgoing pagehide save from replacing the fixture on reload.
    await pet.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key !== "xiaohei.companion.v1") original.call(this, key, value); }; });
    await pet.reload(); await ready(pet);
    await pet.evaluate(() => { Math.random = () => 0; });
    await pet.evaluate(() => window.xiaohei.config.update({ pet: { behaviorMode: "active", followMouse: false } }));
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-visual-action", "Drowsy", { timeout: 16000 });
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Sleep"));
    const energy = Number(await pet.locator(".pet-root").getAttribute("data-energy"));
    await expect.poll(async () => Number(await pet.locator(".pet-root").getAttribute("data-energy"))).toBeGreaterThan(energy + 0.1);
    await pet.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await app.close(); app = await electron.launch(profile.launchOptions);
    await protectTestWindows(app); pet = await app.firstWindow(); await ready(pet);
    const restoredEnergy = Number(await pet.locator(".pet-root").getAttribute("data-energy"));
    expect(restoredEnergy).toBeGreaterThan(15); expect(restoredEnergy).toBeLessThan(25);
    expect(Number(await pet.locator(".pet-root").getAttribute("data-mood"))).toBeGreaterThan(75);
  } finally { await app.close(); }
});
