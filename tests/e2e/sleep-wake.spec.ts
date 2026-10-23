import { _electron as electron, expect, test } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";

test("sleep persists on hover and body clicks and wakes only when the head is clicked", async ({}, testInfo) => {
  test.setTimeout(60000);
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    await protectTestWindows(app);
    const pet = await app.firstWindow();
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    const root = pet.locator(".pet-root");
    for (const scale of [0.6, 1.4]) {
      await pet.evaluate((scale) => window.xiaohei.config.update({ window: { scale }, pet: { followMouse: true, behaviorMode: "active" } }), scale);
      await pet.evaluate(() => window.xiaohei.pet.triggerAction("Sleep"));
      await expect(root).toHaveAttribute("data-action", "Sleep");
      await expect(root).toHaveAttribute("data-behavior-state", "sleeping");
      await pet.waitForTimeout(500); // Let the resize and the sleep entrance finish before locating the head.
      const points = await pet.evaluate(() => {
        let l = (window as any).PIXI.Ticker.shared._head.next;
        while (!l.context?.internalModel) l = l.next;
        const m = l.context, i = m.internalModel;
        const head = i.getDrawableBounds(i.coreModel.getDrawableIndex("ArtMesh58"));
        const body = i.getDrawableBounds(i.coreModel.getDrawableIndex("ArtMesh46"));
        const offset = document.querySelector(".pet-hit-area")!.getBoundingClientRect();
        const center = (b: any) => {
          const p = m.toGlobal(i.localTransform.apply({ x: b.x + b.width / 2, y: b.y + b.height / 2 }));
          return { x: p.x + offset.left, y: p.y + offset.top };
        };
        return { head: center(head), body: center(body) };
      });
      await pet.mouse.move(1, 1);
      await pet.mouse.move(points.head.x, points.head.y);
      await pet.waitForTimeout(500);
      await expect(root).toHaveAttribute("data-action", "Sleep");
      await pet.mouse.click(points.body.x, points.body.y);
      await pet.waitForTimeout(400);
      await expect(root).toHaveAttribute("data-action", "Sleep");
      await pet.mouse.dblclick(points.body.x, points.body.y);
      await pet.waitForTimeout(400);
      await expect(root).toHaveAttribute("data-behavior-state", "sleeping");
      await pet.screenshot({ path: testInfo.outputPath(`sleeping-${scale}.png`) });
      await pet.mouse.click(points.head.x, points.head.y);
      await expect(root).toHaveAttribute("data-action", "Wake");
      await expect(pet.locator(".gesture-sleep")).toHaveCount(0);
      await expect(root).toHaveAttribute("data-action", "Idle", { timeout: 6000 });
    }
    await pet.evaluate(() => window.xiaohei.pet.openActions());
    const fan = app.windows().find((p) => p.url().includes("actions.html"))!;
    await expect(fan.getByRole("button", { name: "醒来", exact: true })).toHaveCount(0);
    await expect(fan.getByRole("group", { name: "选择动作" }).getByRole("button")).toHaveCount(9);
  } finally {
    await app.close();
  }
});
