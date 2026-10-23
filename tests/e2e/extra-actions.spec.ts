import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { EXTRA_ACTIONS } from "../../src/shared/actions.js";
import { createTestProfile, protectTestWindows } from "./profile.js";

async function prepare(app: ElectronApplication) {
  await protectTestWindows(app);
  const pet = await app.firstWindow();
  await expect(pet.locator("canvas")).toBeVisible();
  await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
  await pet.evaluate(() => window.xiaohei.config.update({ window: { scale: 0.8 }, pet: { followMouse: false, initiative: "quiet", autoRest: false } }));
  return pet;
}

test("six new gestures play from the fan, deform the model distinctly, and finish with clean effects", async ({}, info) => {
  test.setTimeout(85000);
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    const pet = await prepare(app);
    await pet.evaluate(() => {
      let l = (window as any).PIXI.Ticker.shared._head.next;
      while (!l.context?.internalModel) l = l.next;
      const model = l.context, internal = model.internalModel;
      (window as any).__gestureFrames = [];
      internal.on("beforeModelUpdate", () => {
        const root = document.querySelector(".pet-root")!;
        const values = Object.fromEntries(["ParamAngleX", "ParamAngleY", "ParamBodyAngleZ", "ParamEyeLOpen", "ParamEyeROpen", "ParamMouthOpenY"].map((id) => [id, internal.coreModel.getParameterValueById(id)]));
        (window as any).__gestureFrames.push({ action: root.getAttribute("data-visual-action"), ...values });
      });
    });
    for (const { name, label } of EXTRA_ACTIONS) {
      await pet.evaluate(() => window.xiaohei.pet.openActions());
      const fan = app.windows().find((p) => p.url().includes("actions.html"))!;
      await fan.getByRole("button", { name: "小表情", exact: true }).click();
      await expect(fan.getByRole("group", { name: "选择动作" }).getByRole("button")).toHaveCount(6);
      await fan.getByRole("button", { name: label, exact: true }).click();
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-visual-action", name);
      await expect(pet.locator(`.reaction-effects[data-effect="${name}"]`)).toHaveCount(1);
      await pet.waitForTimeout(name === "Yawn" ? 1700 : name === "Sway" ? 1500 : 1000);
      await pet.screenshot({ path: info.outputPath(`gesture-${name}.png`) });
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Idle", { timeout: 6500 });
      await expect(pet.locator(".reaction-effects")).toHaveCount(0);
    }
    const frames = await pet.evaluate(() => (window as any).__gestureFrames as Array<Record<string, any>>);
    await info.attach("actual-model-frames", { body: JSON.stringify(frames), contentType: "application/json" });
    const range = (action: string, parameter: string) => {
      const values = frames.filter((f) => f.action === action).map((f) => f[parameter] as number);
      expect(values.length, action).toBeGreaterThan(25);
      return { min: Math.min(...values), max: Math.max(...values) };
    };
    expect(range("Nod", "ParamAngleY").min).toBeLessThan(-8);
    expect(range("ShakeHead", "ParamAngleX").min).toBeLessThan(-10);
    expect(range("ShakeHead", "ParamAngleX").max).toBeGreaterThan(9);
    expect(range("Wink", "ParamEyeROpen").min).toBeLessThan(0.1);
    expect(range("Wink", "ParamEyeLOpen").min).toBeGreaterThan(0.85);
    expect(range("Shy", "ParamAngleY").min).toBeLessThan(-4);
    expect(range("Yawn", "ParamMouthOpenY").max).toBeGreaterThan(0.5);
    expect(range("Yawn", "ParamEyeLOpen").min).toBeLessThan(0.12);
    const sway = range("Sway", "ParamBodyAngleZ");
    expect(sway.max - sway.min).toBeGreaterThan(3);
  } finally { await app.close(); }
});

test("new fan page fits every pet size, supports keyboard and leaves no pose on interruption", async ({}, info) => {
  test.setTimeout(75000);
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    const pet = await prepare(app);
    await pet.evaluate(() => window.xiaohei.pet.openActions());
    const fan = app.windows().find((p) => p.url().includes("actions.html"))!;
    for (const scale of [0.4, 0.7, 1.4, 2]) {
      await pet.evaluate((scale) => window.xiaohei.config.update({ window: { scale } }), scale);
      await fan.getByRole("button", { name: "小表情", exact: true }).click();
      await expect.poll(() => fan.evaluate(() => {
        const nodes = [...document.querySelectorAll("button, .fan-caption")];
        const fits = nodes.every((node) => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; });
        const pages = document.querySelector(".fan-pages")!.getBoundingClientRect();
        const caption = document.querySelector(".fan-caption")!.getBoundingClientRect();
        return fits && pages.bottom < caption.top;
      })).toBe(true);
      await fan.screenshot({ path: info.outputPath(`extra-fan-${scale}.png`) });
      await fan.getByRole("button", { name: "常用动作", exact: true }).click();
      await expect(fan.getByRole("group", { name: "选择动作" }).getByRole("button")).toHaveCount(9);
    }
    await pet.evaluate(() => window.xiaohei.config.update({ window: { scale: 0.8 } }));
    await fan.getByRole("button", { name: "小表情", exact: true }).click();
    await fan.getByRole("button", { name: "轻轻摇摆", exact: true }).focus();
    await fan.keyboard.press("ArrowRight");
    await expect(fan.getByRole("button", { name: "点头", exact: true })).toBeFocused();
    await fan.keyboard.press("Enter");
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-action", "Nod");
    for (const { name } of EXTRA_ACTIONS) {
      await pet.evaluate((name) => window.xiaohei.pet.triggerAction(name), name);
      await expect(pet.locator(".pet-root")).toHaveAttribute("data-visual-action", name);
      await pet.waitForTimeout(900);
      await pet.evaluate(() => window.xiaohei.pet.triggerAction("Pat"));
      await expect(pet.locator(".reaction-effects")).toHaveCount(0);
      await pet.evaluate(() => window.xiaohei.pet.triggerAction("Idle"));
      await pet.waitForTimeout(450);
      const pose = await pet.evaluate(() => {
        let l = (window as any).PIXI.Ticker.shared._head.next;
        while (!l.context?.internalModel) l = l.next;
        const core = l.context.internalModel.coreModel;
        return ["ParamEyeLOpen", "ParamEyeROpen", "ParamAngleX", "ParamAngleY", "ParamBodyAngleZ"].map((id) => core.getParameterValueById(id));
      });
      expect(pose[0]).toBeGreaterThan(0.85); expect(pose[1]).toBeGreaterThan(0.85);
      expect(Math.max(...pose.slice(2).map(Math.abs))).toBeLessThan(0.5);
    }
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Yawn"));
    await pet.waitForTimeout(1700);
    await pet.evaluate(() => window.xiaohei.pet.triggerAction("Sleep"));
    await pet.mouse.move(10, 10); await pet.waitForTimeout(4500);
    await expect(pet.locator(".pet-root")).toHaveAttribute("data-behavior-state", "sleeping");
    await expect(pet.locator(".reaction-effects")).toHaveCount(0);
  } finally { await app.close(); }
});
