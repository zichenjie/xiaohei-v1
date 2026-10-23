import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";

async function prepare(app: ElectronApplication, energy: number, mood: number, random: number) {
  await protectTestWindows(app);
  await app.evaluate(({ powerMonitor }) => { powerMonitor.getSystemIdleTime = () => 0; });
  const pet = await app.firstWindow();
  await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
  await pet.evaluate(() => window.xiaohei.config.update({ window: { scale: 0.7 }, pet: { followMouse: false, behaviorMode: "quiet", initiative: "balanced", autoRest: false, quietUntil: 0 } }));
  await pet.addInitScript(({ energy, mood, random }) => {
    const original = Date.now.bind(Date);
    (window as any).__activityOffset = 0;
    Date.now = () => original() + (window as any).__activityOffset;
    Math.random = () => random;
    const now = Date.now();
    localStorage.setItem("xiaohei.companion.v1", JSON.stringify({ energy, mood, updatedAt: now }));
    localStorage.setItem("xiaohei.autonomy.v1", JSON.stringify({ lastInteractionAt: now - 10 * 60000,
      nextInviteAt: now + 3600000, nextObserveAt: now - 1, nextAutonomousAt: now,
      misses: 0, invitations: [], activities: [], recentActivities: [], lastKind: "touch" }));
  }, { energy, mood, random });
  await pet.reload();
  await expect(pet.locator("canvas")).toBeVisible();
  await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
  return pet;
}

async function advance(pet: Page, steps = 6) {
  for (let n = 0; n < steps; n++) {
    await pet.evaluate(() => { (window as any).__activityOffset += 10000; });
    await pet.waitForTimeout(1100);
  }
}

async function memory(pet: Page) {
  return pet.evaluate(() => {
    window.dispatchEvent(new Event("pagehide"));
    return JSON.parse(localStorage.getItem("xiaohei.autonomy.v1")!);
  });
}

for (const [action, energy, mood, random] of [
  ["Wink", 85, 85, 0], ["Sway", 85, 85, 0.36], ["Nod", 80, 60, 0],
  ["Shy", 80, 30, 0], ["ShakeHead", 80, 30, 0.36], ["Yawn", 25, 85, 0]
] as const) {
  test(`autonomous ${action} follows mood/energy, completes once and saves a quiet interval`, async ({}, info) => {
    test.setTimeout(45000);
    const app = await electron.launch(createTestProfile().launchOptions);
    try {
      const pet = await prepare(app, energy, mood, random);
      const before = await memory(pet);
      const beforeMood = Number(await pet.locator(".pet-root").getAttribute("data-mood"));
      await advance(pet);
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-autonomy", "acting");
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-visual-action", action);
      await expect(pet.locator(`.reaction-effects[data-effect="${action}"]`)).toHaveCount(1);
      await pet.screenshot({ path: info.outputPath(`autonomous-${action}.png`) });
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Idle", { timeout: 6500 });
      await expect(pet.locator(".reaction-effects")).toHaveCount(0);
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-autonomy", "quiet");
      if (mood > 55) expect(Number(await pet.locator(".pet-root").getAttribute("data-mood"))).toBeLessThanOrEqual(beforeMood);
      const after = await memory(pet);
      expect(after.lastInteractionAt).toBe(before.lastInteractionAt);
      expect(after.activities).toHaveLength(1);
      expect(after.recentActivities).toEqual([action]);
      const clock = await pet.evaluate(() => Date.now());
      expect(after.nextObserveAt - clock).toBeGreaterThan(4 * 60000);
      expect(after.nextAutonomousAt - clock).toBeGreaterThan(40000);
      expect(app.windows().some((p) => p.url().includes("companion.html"))).toBe(false);
      await advance(pet, 2);
      expect((await memory(pet)).activities).toHaveLength(1);
      await expect(pet.locator(".pet-root")).not.toHaveAttribute("data-autonomy", "acting");
    } finally { await app.close(); }
  });
}

test("automatic expressions yield to manual input and cannot wake sleep, even when overdue", async () => {
  test.setTimeout(50000);
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    const pet = await prepare(app, 25, 80, 0);
    await advance(pet);
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-visual-action", "Yawn");
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Pat"));
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Pat");
    await expect(pet.locator(".reaction-effects")).toHaveCount(0);
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-autonomy", "quiet");
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Sleep"));
    await pet.evaluate(() => { (window as any).__activityOffset += 30 * 60000; });
    await pet.waitForTimeout(1500);
    const p = await pet.evaluate(() => {
      let l = (window as any).PIXI.Ticker.shared._head.next;
      while (!l.context?.internalModel) l = l.next;
      const m = l.context, i = m.internalModel;
      const rect = document.querySelector(".pet-hit-area")!.getBoundingClientRect();
      const point = (id: string) => {
        const b = i.getDrawableBounds(i.coreModel.getDrawableIndex(id));
        const p = m.toGlobal(i.localTransform.apply({ x: b.x + b.width / 2, y: b.y + b.height / 2 }));
        return { x: p.x + rect.left, y: p.y + rect.top };
      };
      return { head: point("ArtMesh58"), body: point("ArtMesh46") };
    });
    await pet.mouse.move(p.head.x, p.head.y);
    await pet.mouse.click(p.body.x, p.body.y);
    await pet.waitForTimeout(1000);
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-behavior-state", "sleeping");
    expect((await memory(pet)).activities).toHaveLength(1);
    await pet.mouse.click(p.head.x, p.head.y);
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Wake");
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Idle", { timeout: 6000 });
    await pet.waitForTimeout(1500);
    await expect(pet.locator(".pet-root")).not.toHaveAttribute("data-autonomy", "acting");
  } finally { await app.close(); }
});
