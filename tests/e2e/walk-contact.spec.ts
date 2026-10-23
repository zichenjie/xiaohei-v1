import { _electron as electron, expect, test } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";
import { walkTravel } from "../../src/shared/walk.js";

for (const scenario of [{ scale: 0.7, x: 0 }, { scale: 1.4, x: 99999 }]) {
test(`planted soles stay in place at scale ${scenario.scale} and the closing step stops travel`, async ({}, testInfo) => {
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    await protectTestWindows(app);
    const pet = await app.firstWindow();
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await pet.evaluate((scenario) => window.xiaohei.config.update({ pet: { followMouse: false }, window: { locked: false, ...scenario } }), scenario);
    await pet.evaluate(() => {
      let listener = (window as any).PIXI.Ticker.shared._head.next;
      while (listener && !listener.context?.internalModel) listener = listener.next;
      const core = listener.context.internalModel.coreModel;
      const drawables = core.getModel().drawables;
      const soles = ["ArtMesh54", "ArtMesh55"].map((id) => {
        const vertices = drawables.vertexPositions[drawables.ids.indexOf(id)];
        const ys = Array.from(vertices as Float32Array).filter((_, i) => i % 2 === 1);
        const bottom = Math.min(...ys);
        const indices = ys.map((y, i) => y < bottom + 0.008 ? i * 2 : -1).filter((i) => i >= 0);
        return { vertices, indices };
      });
      let frame: { progress: number; distance: number; stride: number } | null = null;
      window.xiaohei.pet.onWalkFrame((next) => { frame = next; });
      const samples: Array<Record<string, number>> = [];
      (window as any).__contactSamples = samples;
      const update = core.update;
      core.update = function () {
        update.call(core);
        if (!frame) return;
        const [right, left] = soles.map(({ vertices, indices }) => indices.reduce((sum, i) => sum + vertices[i], 0) / indices.length);
        samples.push({ ...frame, right: right + frame.distance, left: left + frame.distance,
          yaw: core.getParameterValueById("ParamAngleX"), bodyYaw: core.getParameterValueById("ParamBodyAngleX"),
          gaze: core.getParameterValueById("ParamEyeBallX"), secondaryYaw: core.getParameterValueById("ParamAngleX2") });
      };
    });
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Move"));
    await pet.waitForTimeout(1200);
    await pet.screenshot({ path: testInfo.outputPath("walking-facing.png") });
    await pet.waitForTimeout(1500);
    const samples = await pet.evaluate(() => (window as any).__contactSamples as Array<Record<string, number>>);
    const turned = samples.filter((sample) => sample.progress > 0.25 && sample.progress < 0.65);
    expect(turned.length).toBeGreaterThan(8);
    for (const sample of turned) {
      const direction = Math.sign(sample.stride);
      expect(sample.yaw * direction).toBeGreaterThan(20);
      expect(sample.bodyYaw * direction).toBeGreaterThan(0);
      expect(sample.secondaryYaw * direction).toBeGreaterThan(8);
      expect(sample.gaze * direction).toBeGreaterThan(0.4);
    }
    // Body physics eases into the turn; require the direction on every frame
    // and the intended visible magnitude over the sustained walking phase.
    expect(turned.reduce((sum, sample) => sum + sample.bodyYaw * Math.sign(sample.stride), 0) / turned.length).toBeGreaterThan(2.5);
    const finalYaw = await pet.evaluate(() => {
      let listener = (window as any).PIXI.Ticker.shared._head.next;
      while (listener && !listener.context?.internalModel) listener = listener.next;
      return listener.context.internalModel.coreModel.getParameterValueById("ParamAngleX");
    });
    expect(Math.abs(finalYaw)).toBeLessThan(0.01);
    for (let step = 0; step < 4; step++) {
      const stance = samples.filter((sample) => walkTravel(sample.progress) > step + 0.15 && walkTravel(sample.progress) < step + 0.85);
      expect(stance.length).toBeGreaterThan(5);
      const values = stance.map((sample) => sample[step % 2 === 0 ? "left" : "right"]);
      expect(Math.max(...values) - Math.min(...values), `step ${step} planted foot drift`).toBeLessThan(0.008);
    }
    const closing = samples.filter((sample) => sample.progress > 0.83 && sample.progress < 0.98).map((sample) => sample.distance);
    expect(closing.length).toBeGreaterThan(3);
    expect(Math.max(...closing) - Math.min(...closing)).toBeLessThan(0.001);
    await testInfo.attach("ground-contact", { body: JSON.stringify(samples), contentType: "application/json" });
  } finally {
    await app.close();
  }
});
}
