import { _electron as electron, expect, test } from "@playwright/test";
import { createTestProfile, protectTestWindows } from "./profile.js";
import { writeFileSync } from "node:fs";

test("native transparent surface stays clear after focus loss and movement", async ({}, testInfo) => {
  const app = await electron.launch(createTestProfile().launchOptions);
  try {
    await protectTestWindows(app);
    const pet = await app.firstWindow();
    await expect(pet.locator("canvas")).toBeVisible();
    await expect(pet.locator(".pet-overlay")).toHaveCount(0, { timeout: 20000 });
    await pet.evaluate(() => window.xiaohei.config.update({ window: { scale: 0.6, x: 400, y: 250 }, pet: { followMouse: false } }));
    await pet.locator("canvas").evaluate((canvas) => { canvas.style.visibility = "hidden"; });
    await app.evaluate(async ({ BrowserWindow }) => {
      const bounds = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("/index.html"))!.getBounds();
      // A local backdrop is sufficient for inspecting native chrome. Covering
      // the entire monitor unnecessarily interrupts the user's other apps.
      const background = new BrowserWindow({ x: bounds.x - 48, y: bounds.y - 48, width: bounds.width + 96, height: bounds.height + 96,
        frame: false, show: false, resizable: false, skipTaskbar: true, alwaysOnTop: true, title: "Native frame test background", backgroundColor: "#181818" });
      await background.loadURL("data:text/html,<body style='margin:0;background:%23181818'></body>");
      background.showInactive();
    });
    for (let cycle = 0; cycle < 3; cycle++) {
      await pet.evaluate(async () => {
        await window.xiaohei.pet.startDrag();
        await window.xiaohei.pet.moveDrag({ dx: -8, dy: -4 });
        await window.xiaohei.pet.endDrag({ dx: -8, dy: -4 });
      });
      const capture = await app.evaluate(async ({ BrowserWindow, desktopCapturer, screen }) => {
        const pet = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("/index.html"))!;
        const background = BrowserWindow.getAllWindows().find((window) => window.getTitle() === "Native frame test background")!;
        pet.focus();
        background.focus();
        pet.blur();
        pet.moveTop();
        await new Promise((resolve) => setTimeout(resolve, 150));
        const bounds = pet.getBounds();
        const display = screen.getDisplayMatching(bounds);
        const source = (await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) } }))
          .find((source) => source.display_id === String(display.id));
        if (!source || source.thumbnail.isEmpty()) throw new Error("Native window capture is unavailable");
        const fullSize = source.thumbnail.getSize();
        const scale = fullSize.width / display.size.width;
        // Persist only this test window's rectangle, including native chrome.
        const thumbnail = source.thumbnail.crop({ x: Math.round((bounds.x - display.bounds.x) * scale), y: Math.round((bounds.y - display.bounds.y) * scale), width: Math.round(bounds.width * scale), height: Math.round(bounds.height * scale) });
        const size = thumbnail.getSize();
        const bitmap = thumbnail.toBitmap();
        const bandHeight = Math.min(35, size.height);
        let light = 0;
        for (let y = 0; y < bandHeight; y++) {
          for (let x = 0; x < size.width; x++) {
            const offset = (y * size.width + x) * 4;
            if (bitmap[offset] > 130 && bitmap[offset + 1] > 130 && bitmap[offset + 2] > 100 && bitmap[offset + 3] > 128) light++;
          }
        }
        return { lightFraction: light / (bandHeight * size.width), png: thumbnail.toPNG().toString("base64"), size, focused: pet.isFocused() };
      });
      await testInfo.attach(`native-blur-${cycle}`, { body: Buffer.from(capture.png, "base64"), contentType: "image/png" });
      writeFileSync(testInfo.outputPath(`native-blur-${cycle}.png`), Buffer.from(capture.png, "base64"));
      expect(capture.focused).toBe(false);
      expect(capture.lightFraction, JSON.stringify({ size: capture.size, cycle })).toBeLessThan(0.01);
    }
  } finally {
    await app.close();
  }
});
