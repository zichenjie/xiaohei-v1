import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";

async function observePose(pet: Page) {
  await pet.evaluate(() => {
    let listener = (window as any).PIXI.Ticker.shared._head.next;
    while (listener && !listener.context?.internalModel) listener = listener.next;
    const internal = listener.context.internalModel;
    internal.on("beforeModelUpdate", () => {
      (window as any).__renderedPose = Object.fromEntries([
        "Paramby", "ParamEyeLOpen", "ParamEyeROpen", "ParamEyeLSmile", "ParamEyeRSmile",
        "ParamAngleX", "ParamAngleY", "ParamAngleZ", "ParamEyeBallX", "ParamEyeBallY"
      ].map((id) => [id, internal.coreModel.getParameterValueById(id)]));
    });
  });
}

test("named actions show distinct gestures and moving changes desktop position", async ({}, testInfo) => {
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    await protectTestWindows(app);
    const pet = await app.firstWindow();
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await observePose(pet);
    await pet.evaluate(() => window.xiaohei.config.update({ pet: { followMouse: true }, window: { locked: false } }));
    await pet.mouse.move(30, 470);
    const restingHandY = await pet.evaluate(() => {
      let listener = (window as any).PIXI.Ticker.shared._head.next;
      while (listener && !listener.context?.internalModel) listener = listener.next;
      const drawables = listener.context.internalModel.coreModel.getModel().drawables;
      const vertices = drawables.vertexPositions[drawables.ids.indexOf("ArtMesh53")];
      const ys = Array.from(vertices as Float32Array).filter((_, index) => index % 2 === 1);
      return ys.reduce((sum, value) => sum + value, 0) / ys.length;
    });
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Greet"));
    let greeting: Record<string, number> = {};
    await expect.poll(async () => {
      greeting = await pet.evaluate(() => {
        let listener = (window as any).PIXI.Ticker.shared._head.next;
        while (listener && !listener.context?.internalModel) listener = listener.next;
        const drawables = listener.context.internalModel.coreModel.getModel().drawables;
        const vertices = drawables.vertexPositions[drawables.ids.indexOf("ArtMesh53")];
        const ys = Array.from(vertices as Float32Array).filter((_, index) => index % 2 === 1);
        return { ...(window as any).__renderedPose, handY: ys.reduce((sum, value) => sum + value, 0) / ys.length };
      });
      return greeting.handY > restingHandY + 0.015 && Math.abs(greeting.ParamAngleX) < 0.1 && Math.abs(greeting.ParamEyeBallX) < 0.1;
    }, { timeout: 2000, intervals: [30] }).toBe(true);
    expect(Math.abs(greeting.ParamAngleX)).toBeLessThan(0.1);
    expect(greeting.handY).toBeGreaterThan(restingHandY + 0.015);
    expect(Math.abs(greeting.ParamEyeBallX)).toBeLessThan(0.1);
    await expect(pet.getByText("你好呀", { exact: true })).toBeVisible();
    await pet.screenshot({ path: testInfo.outputPath("greet.png") });
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Pat"));
    await pet.waitForTimeout(800);
    expect(await pet.evaluate(() => (window as any).__renderedPose.ParamEyeLOpen)).toBeLessThan(0.1);
    await pet.screenshot({ path: testInfo.outputPath("pat.png") });
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("hair"));
    await expect(pet.getByText("✋", { exact: true })).toHaveCount(0);
    await pet.evaluate(() => {
      let listener = (window as any).PIXI.Ticker.shared._head.next;
      while (listener && !listener.context?.internalModel) listener = listener.next;
      const internal = listener.context.internalModel;
      const samples: number[] = [];
      (window as any).__legSpans = samples;
      internal.on("beforeModelUpdate", () => {
        const drawables = internal.coreModel.getModel().drawables;
        const centerX = (id: string) => {
          const vertices = drawables.vertexPositions[drawables.ids.indexOf(id)];
          const ys = Array.from(vertices as Float32Array).filter((_, index) => index % 2 === 1);
          const bottom = Math.min(...ys);
          const xs = Array.from(vertices as Float32Array).filter((_, index) => index % 2 === 0 && vertices[index + 1] < bottom + 0.008);
          return xs.reduce((sum, value) => sum + value, 0) / xs.length;
        };
        samples.push(centerX("ArtMesh54") - centerX("ArtMesh55"));
      });
    });
    const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("/index.html"))!.getBounds());
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Move"));
    await pet.waitForTimeout(2700);
    const legSpans = await pet.evaluate(() => (window as any).__legSpans as number[]);
    expect(Math.max(...legSpans) - Math.min(...legSpans)).toBeGreaterThan(0.03);
    const after = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("/index.html"))!.getBounds());
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(20);
    expect([after.width, after.height]).toEqual([before.width, before.height]);
    await pet.evaluate(() => window.xiaohei.config.update({ window: { locked: true } }));
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Move"));
    await pet.waitForTimeout(1400);
    const locked = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("/index.html"))!.getBounds());
    expect(locked).toEqual(after);
  } finally {
    await app.close();
  }
});

test("disabled mouse follow keeps the rendered head facing forward", async ({}, testInfo) => {
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    const pet = await app.firstWindow();
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await observePose(pet);
    await pet.evaluate(() => window.xiaohei.config.update({ pet: { followMouse: true } }));
    await pet.mouse.move(30, 470);
    await expect.poll(() => pet.evaluate(() => Math.abs((window as any).__renderedPose?.ParamAngleY))).toBeGreaterThan(4);
    await pet.evaluate(() => window.xiaohei.config.update({ pet: { followMouse: false } }));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.setIgnoreMouseEvents(true)));
    // Return is now a damped movement, followed by a stable neutral pose.
    await expect.poll(() => pet.evaluate(() => Math.abs((window as any).__renderedPose.ParamAngleY))).toBeLessThan(0.01);
    for (let sample = 0; sample < 8; sample++) {
      await pet.waitForTimeout(200);
      const pose = await pet.evaluate(() => (window as any).__renderedPose);
      expect(Math.abs(pose.ParamAngleY), JSON.stringify(pose)).toBeLessThan(0.01);
      expect(Math.abs(pose.ParamEyeBallY)).toBeLessThan(0.01);
    }
    await pet.screenshot({ path: testInfo.outputPath("forward.png") });
  } finally {
    await app.close();
  }
});

test("interrupted and repeated pats restore open eyes while sleep still closes them", async ({}, testInfo) => {
  test.setTimeout(60000);
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    const pet = await app.firstWindow();
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await pet.evaluate(() => window.xiaohei.config.update({ pet: { followMouse: false } }));
    await observePose(pet);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.setIgnoreMouseEvents(true)));
    for (const interrupt of ["Greet", "Curious", "Happy", "Sleep", "Move", "Idle"] as const) {
      await pet.evaluate(() => window.xiaohei.pet.triggerAction("Pat"));
      await pet.waitForTimeout(700);
      await pet.evaluate((action) => window.xiaohei.pet.triggerAction(action), interrupt);
      await pet.waitForTimeout(300);
      await pet.evaluate(() => window.xiaohei.pet.triggerAction("Pat"));
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Idle", { timeout: 6000 });
      const pose = await pet.evaluate(() => (window as any).__renderedPose);
      expect(pose.ParamEyeLOpen, `${interrupt}: ${JSON.stringify(pose)}`).toBeGreaterThan(0.95);
      expect(pose.ParamEyeROpen).toBeGreaterThan(0.95);
      expect(Math.abs(pose.ParamEyeLSmile)).toBeLessThan(0.01);
      expect(Math.abs(pose.ParamEyeRSmile)).toBeLessThan(0.01);
      // Stop a pat while the eyes are closed and return directly to idle too.
      await pet.evaluate(() => window.xiaohei.pet.triggerAction("Pat"));
      await pet.waitForTimeout(700);
      await pet.evaluate(() => window.xiaohei.pet.triggerAction("Idle"));
      await expect.poll(() => pet.evaluate(() => {
        const pose = (window as any).__renderedPose;
        return pose.ParamEyeLOpen > 0.99 && pose.ParamEyeROpen > 0.99 &&
          Math.abs(pose.ParamEyeLSmile) < 0.01 && Math.abs(pose.ParamEyeRSmile) < 0.01;
      }), { timeout: 2000 }).toBe(true);
      const interruptedPose = await pet.evaluate(() => (window as any).__renderedPose);
      expect(interruptedPose.ParamEyeLOpen, `${interrupt}: ${JSON.stringify(interruptedPose)}`).toBeGreaterThan(0.95);
      expect(Math.abs(interruptedPose.ParamEyeLSmile)).toBeLessThan(0.01);
    }
    await pet.screenshot({ path: testInfo.outputPath("pat-restored.png") });
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Sleep"));
    await pet.waitForTimeout(1000);
    expect(await pet.evaluate(() => (window as any).__renderedPose.ParamEyeLOpen)).toBeLessThan(0.05);
  } finally {
    await app.close();
  }
});
