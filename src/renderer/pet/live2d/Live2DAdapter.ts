import type * as Pixi from "pixi.js";
import type { Live2DModel as Live2DModelType } from "pixi-live2d-display/cubism4";
import type { PetExpressionName, PetMotionName } from "../../../shared/actions.js";

export type MotionGroup = PetMotionName;
export type ExpressionName = PetExpressionName;

export interface Live2DAdapter {
  load(modelPath: string, canvas: HTMLCanvasElement): Promise<void>;
  /** Resolves when the requested motion has completed. */
  playMotion(group: MotionGroup, options?: { restart?: boolean }): Promise<void>;
  playModelMove(): Promise<void>;
  /** Applies an expression immediately; expressions do not drive motion cooldown. */
  setExpression(name: ExpressionName, options?: { restart?: boolean }): Promise<void>;
  focus(point: { x: number; y: number }, options?: { instant?: boolean }): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

type PixiModule = typeof Pixi;
type Live2DModule = typeof import("pixi-live2d-display/cubism4");
type Live2DModel = InstanceType<typeof Live2DModelType>;

interface WindowWithPixi extends Window {
  PIXI?: PixiModule;
}

function isLive2DModelPath(modelPath: string): boolean {
  return modelPath.trim().toLowerCase().endsWith(".model3.json");
}

function toWslPath(normalizedPath: string): string | null {
  const match = /^([a-z]):\/(.*)$/i.exec(normalizedPath);
  if (!match) {
    return null;
  }

  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean)));
}

function modelUrls(modelPath: string): string[] {
  const normalized = modelPath.replace(/\\/g, "/");
  const isDevServer = window.location.protocol === "http:" || window.location.protocol === "https:";

  if (isDevServer && (normalized.startsWith("/") || /^[a-z]:\//i.test(normalized))) {
    const wslPath = toWslPath(normalized);
    return uniqueUrls([wslPath ? `/@fs/${encodeURI(wslPath)}` : "", `/@fs/${encodeURI(normalized)}`]);
  }

  if (/^[a-z]:\//i.test(normalized)) {
    return [`file:///${encodeURI(normalized)}`];
  }

  if (normalized.startsWith("/")) {
    return [`file://${encodeURI(normalized)}`];
  }

  return [encodeURI(normalized)];
}

async function loadPixiRuntime(): Promise<{ PIXI: PixiModule; live2d: Live2DModule }> {
  const PIXI = await import("pixi.js");
  (window as WindowWithPixi).PIXI = PIXI;

  const live2d = (await import("pixi-live2d-display/cubism4")) as Live2DModule;
  live2d.Live2DModel.registerTicker(PIXI.Ticker);

  return { PIXI, live2d };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldReturnToIdle(group: MotionGroup): boolean {
  return group !== "Idle" && group !== "Sleep";
}

export function createLive2DAdapter(): Live2DAdapter {
  let app: Pixi.Application | null = null;
  let model: Live2DModel | null = null;
  let priorities: Live2DModule["MotionPriority"] | null = null;
  let disposed = false;
  let width = 720;
  let height = 1040;
  let modelMoveFrame: number | null = null;

  function assertModel(): Live2DModel {
    if (!model) {
      throw new Error("Live2D model is not loaded");
    }

    return model;
  }

  function fitModel(): void {
    if (!model || width <= 0 || height <= 0) {
      return;
    }

    model.scale.set(1);
    const modelWidth = model.width || 1;
    const modelHeight = model.height || 1;
    const scale = Math.min(width / modelWidth, height / modelHeight) * 0.94;

    model.scale.set(scale);
    model.anchor.set(0.5, 0.5);
    model.position.set(width / 2, height / 2);
  }

  function cancelModelMove(): void {
    if (modelMoveFrame !== null) {
      window.cancelAnimationFrame(modelMoveFrame);
      modelMoveFrame = null;
    }
  }

  async function animateWholeModelMove(): Promise<void> {
    const currentModel = assertModel();
    cancelModelMove();

    const originX = width / 2;
    const originY = height / 2;
    const durationMs = 1200;
    const horizontal = Math.max(14, width * 0.075);
    const vertical = Math.max(10, height * 0.045);
    const startedAt = performance.now();

    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (disposed || model !== currentModel) {
          modelMoveFrame = null;
          resolve();
          return;
        }

        const progress = Math.min((now - startedAt) / durationMs, 1);
        const wave = Math.sin(progress * Math.PI * 4);
        const hop = Math.abs(Math.sin(progress * Math.PI * 4));
        currentModel.position.set(originX + wave * horizontal, originY - hop * vertical);

        if (progress >= 1) {
          currentModel.position.set(originX, originY);
          modelMoveFrame = null;
          resolve();
          return;
        }

        modelMoveFrame = window.requestAnimationFrame(tick);
      };

      modelMoveFrame = window.requestAnimationFrame(tick);
    });
  }

  async function startMotion(group: MotionGroup, force: boolean): Promise<boolean> {
    const currentModel = assertModel();
    const motionPriority = force ? priorities?.FORCE : priorities?.IDLE;
    const started = await currentModel.motion(group, 0, motionPriority);
    console.info(`[live2d] motion ${group}: ${started ? "started" : "skipped"}`);

    if (!started || !shouldReturnToIdle(group)) {
      return started;
    }

    await wait(1800);
    if (!disposed && model === currentModel) {
      await currentModel.motion("Idle", 0, priorities?.IDLE);
    }
    return started;
  }

  return {
    async load(modelPath: string, targetCanvas: HTMLCanvasElement): Promise<void> {
      if (!isLive2DModelPath(modelPath)) {
        throw new Error(`Unsupported Live2D model path: ${modelPath}`);
      }

      disposed = false;
      const { PIXI, live2d } = await loadPixiRuntime();
      priorities = live2d.MotionPriority;

      const canvasWidth = targetCanvas.clientWidth || targetCanvas.width;
      const canvasHeight = targetCanvas.clientHeight || targetCanvas.height;
      width = Math.max(1, Math.floor(canvasWidth));
      height = Math.max(1, Math.floor(canvasHeight));

      app = new PIXI.Application({
        view: targetCanvas,
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1
      });

      let lastError: unknown;
      for (const url of modelUrls(modelPath)) {
        try {
          model = await live2d.Live2DModel.from(url, {
            autoInteract: false,
            motionPreload: live2d.MotionPreloadStrategy.ALL,
            idleMotionGroup: "Idle"
          });
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!model) {
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }

      model.autoUpdate = true;
      app.stage.addChild(model);
      fitModel();
      await startMotion("Idle", false);
    },

    async playMotion(group: MotionGroup, options?: { restart?: boolean }): Promise<void> {
      const currentModel = assertModel();
      if (options?.restart) {
        currentModel.internalModel.motionManager.stopAllMotions();
      }

      await startMotion(group, group !== "Idle" || Boolean(options?.restart));
    },

    async playModelMove(): Promise<void> {
      const currentModel = assertModel();
      currentModel.internalModel.motionManager.stopAllMotions();
      await Promise.all([startMotion("Move", true), animateWholeModelMove()]);
    },

    async setExpression(name: ExpressionName, options?: { restart?: boolean }): Promise<void> {
      const currentModel = assertModel();
      if (options?.restart) {
        currentModel.internalModel.motionManager.expressionManager?.resetExpression();
      }

      const changed = await currentModel.expression(name);
      console.info(`[live2d] expression ${name}: ${changed ? "applied" : "skipped"}`);
    },

    focus(point: { x: number; y: number }, options?: { instant?: boolean }): void {
      const currentModel = model;
      if (!currentModel) {
        return;
      }

      currentModel.focus(width * point.x, height * point.y, options?.instant);
    },

    resize(nextWidth: number, nextHeight: number): void {
      if (nextWidth <= 0 || nextHeight <= 0) {
        throw new Error("Canvas size must be positive");
      }

      width = Math.floor(nextWidth);
      height = Math.floor(nextHeight);
      cancelModelMove();
      app?.renderer.resize(width, height);
      fitModel();
    },

    dispose(): void {
      disposed = true;
      cancelModelMove();
      model = null;
      priorities = null;
      app?.destroy(true, { children: true, texture: true, baseTexture: true });
      app = null;
    }
  };
}
