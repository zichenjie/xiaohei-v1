import { _electron as electron, expect, test } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";

test("pat uses a back-of-hand drawing attached to the crown at different pet sizes", async ({}, testInfo) => {
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    await protectTestWindows(app);
    const pet = await app.firstWindow();
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    for (const scale of [0.6, 1, 1.4]) {
      await pet.evaluate((scale) => window.xiaohei.config.update({ window: { scale }, pet: { followMouse: false, behaviorMode: "quiet" } }), scale);
      await pet.evaluate(() => window.xiaohei.pet.triggerAction("Pat"));
      await expect(pet.locator("svg.gesture-hand")).toBeVisible();
      await pet.waitForTimeout(700);
      const contact = await pet.evaluate(() => {
        let l = (window as any).PIXI.Ticker.shared._head.next;
        while (!l.context?.internalModel) l = l.next;
        const m = l.context, internal = m.internalModel;
        const b = internal.getDrawableBounds(internal.coreModel.getDrawableIndex("ArtMesh58"));
        const crown = m.toGlobal(internal.localTransform.apply({ x: b.x + b.width * 0.3, y: b.y + b.height * 0.14 }));
        const area = document.querySelector<HTMLElement>(".pet-hit-area")!;
        const style = getComputedStyle(area);
        const hand = document.querySelector(".gesture-hand")!;
        const r = hand.getBoundingClientRect(), parent = area.getBoundingClientRect();
        return { dx: Math.abs(parseFloat(style.getPropertyValue("--pat-x")) - crown.x), dy: Math.abs(parseFloat(style.getPropertyValue("--pat-y")) - crown.y), width: parseFloat(style.getPropertyValue("--pat-width")), hairWidth: b.width * Math.abs(internal.localTransform.a * m.scale.x), overlapsCrown: r.left < parent.left + crown.x && r.right > parent.left + crown.x && r.top < parent.top + crown.y && r.bottom > parent.top + crown.y - 5, handView: hand.getAttribute("data-view") };
      });
      expect(contact.dx).toBeLessThan(3);
      expect(contact.dy).toBeLessThan(3);
      expect(contact.width / contact.hairWidth).toBeCloseTo(0.45, 2);
      expect(contact.overlapsCrown).toBe(true);
      expect(contact.handView).toBe("back");
      await pet.screenshot({ path: testInfo.outputPath(`pat-hand-${scale}.png`) });
      await pet.evaluate(() => window.xiaohei.pet.triggerAction("Idle"));
      await expect(pet.locator(".gesture-hand")).toHaveCount(0);
    }
    await pet.locator(".pet-hit-area").click();
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", /HeadTouch|CheekLeft|CheekRight|BodyTouch/);
    await expect(pet.locator("svg.gesture-hand")).toHaveCount(0);
  } finally {
    await app.close();
  }
});
