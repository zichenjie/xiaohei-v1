import { _electron as electron, expect, test } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";

test("right-hand greeting pins the shoulder and small steps preserve the upper pants seam", async () => {
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    await protectTestWindows(app);
    const pet = await app.firstWindow();
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await pet.evaluate(() => window.xiaohei.config.update({ pet: { followMouse: false }, window: { locked: false } }));
    await pet.evaluate(() => {
      let listener = (window as any).PIXI.Ticker.shared._head.next;
      while (listener && !listener.context?.internalModel) listener = listener.next;
      const core = listener.context.internalModel.coreModel;
      const d = core.getModel().drawables;
      const fixed = new Map<string, number[]>();
      for (const id of ["ArtMesh51", "ArtMesh52", "ArtMesh53", "ArtMesh60", "ArtMesh66", "ArtMesh68", "ArtMesh54", "ArtMesh55", "ArtMesh116"]) {
        const v = d.vertexPositions[d.ids.indexOf(id)];
        const threshold = ["ArtMesh54", "ArtMesh55", "ArtMesh116"].includes(id) ? -0.295 : -0.085;
        const indices: number[] = [];
        for (let i = 0; i < v.length; i += 2) if (v[i + 1] > threshold) indices.push(i);
        fixed.set(id, indices);
      }
      const samples: Record<string, number[][]> = {};
      (window as any).__shapeSamples = samples;
      const update = core.update;
      core.update = function () {
        update.call(core);
        const action = document.querySelector(".pet-root")?.getAttribute("data-action");
        if (action !== "Greet" && action !== "Move") return;
        const values: number[] = [];
        const meshes = action === "Greet" ? ["ArtMesh51", "ArtMesh52", "ArtMesh53", "ArtMesh60", "ArtMesh66", "ArtMesh68"] : ["ArtMesh54", "ArtMesh55", "ArtMesh116"];
        for (const id of meshes) {
          const v = d.vertexPositions[d.ids.indexOf(id)];
          for (const i of fixed.get(id)!) values.push(v[i], v[i + 1]);
        }
        (samples[action] ??= []).push(values);
      };
    });
    for (const action of ["Greet", "Move"] as const) {
      await pet.evaluate((action) => window.xiaohei.pet.triggerAction(action), action);
      await pet.waitForTimeout(2300);
      const samples = await pet.evaluate((action) => (window as any).__shapeSamples[action] as number[][], action);
      expect(samples.length).toBeGreaterThan(20);
      // Skip command dispatch frames before Cubism starts the requested action.
      const stable = samples.slice(8, -2);
      for (const sample of stable) {
        expect(sample.length).toBe(stable[0].length);
        expect(Math.max(...sample.map((value, i) => Math.abs(value - stable[0][i])))).toBeLessThan(0.00001);
      }
    }
  } finally {
    await app.close();
  }
});
