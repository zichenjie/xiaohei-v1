import type * as Pixi from "pixi.js";
import type { Cubism4InternalModel, Live2DModel as Live2DModelType } from "pixi-live2d-display/cubism4";
import type { PetExpressionName, PetMotionName } from "../../../shared/actions.js";
import { createLimbAnimator, type LimbCore } from "./limbAnimator.js";
import { classifyHeadPoint, isSoftAction, type CompanionState, type SoftAction, type TouchTarget } from "../behavior/companion.js";
import { approach, smooth, softPose, softDuration } from "./presenceAnimator.js";

export type MotionGroup = PetMotionName;
export type ExpressionName = PetExpressionName;

export interface Live2DAdapter {
  load(modelPath: string, canvas: HTMLCanvasElement): Promise<void>;
  /** Resolves when the requested motion has completed. */
  playMotion(group: MotionGroup, options?: { restart?: boolean }): Promise<boolean>;
  playModelMove(): Promise<boolean>;
  playReaction(action: SoftAction): Promise<boolean>;
  cancelMotion(): void;
  /** Applies an expression immediately; expressions do not drive motion cooldown. */
  setExpression(name: ExpressionName, options?: { restart?: boolean }): Promise<void>;
  focus(point: { x: number; y: number }, options?: { instant?: boolean }): void;
  resize(width: number, height: number): void;
  getHeadAnchor(): { x: number; y: number; width: number } | null;
  getFaceAnchor(): { x: number; y: number; width: number; height: number } | null;
  hitTestHead(point: { x: number; y: number }): boolean;
  hitTest(point: { x: number; y: number }): TouchTarget;
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
  const { install } = await import("@pixi/unsafe-eval");
  install(PIXI);
  (window as WindowWithPixi).PIXI = PIXI;

  const live2d = (await import("pixi-live2d-display/cubism4")) as Live2DModule;
  live2d.Live2DModel.registerTicker(PIXI.Ticker);

  return { PIXI, live2d };
}

function shouldReturnToIdle(group: MotionGroup): boolean {
  return group !== "Idle" && group !== "Sleep";
}

export function createLive2DAdapter(getPresence: () => { companion: CompanionState; strokeX: number } = () => ({ companion: { energy: 75, mood: 60, updatedAt: 0 }, strokeX: 0 })): Live2DAdapter {
  let app: Pixi.Application | null = null;
  let model: Live2DModel | null = null;
  let priorities: Live2DModule["MotionPriority"] | null = null;
  let disposed = false;
  let width = 720;
  let height = 1040;
  let modelMoveFrame: number | null = null;
  let finishModelMove: (() => void) | null = null;
  let motionVersion = 0;
  let finishMotion: ((completed: boolean) => void) | null = null;
  let poseDefaults: number[] = [];
  let gazeSuppressed = false;
  let limbAnimator: ReturnType<typeof createLimbAnimator> | null = null;
  let unsubscribeWalk: (() => void) | null = null;
  let walking = false;
  let latestFocus = { x: 0.5, y: 0.5 };
  let currentAction: MotionGroup | SoftAction = "Idle";
  let reactionStart = 0;
  let finishReaction: ((completed: boolean) => void) | null = null;
  let lastFrame = performance.now();
  let eyeX = 0, eyeY = 0, headX = 0, headY = 0, strokeX = 0;
  let nextBlink = performance.now() + 3500;
  let blinkStart = -Infinity;
  let originalUpdateFocus: (() => void) | undefined;
  const transitionIds = ["Paramby", "ParamAngleX", "ParamAngleY", "ParamAngleZ", "ParamBodyAngleX", "ParamBodyAngleY", "ParamBodyAngleZ", "ParamEyeBallX", "ParamEyeBallY", "ParamEyeLOpen", "ParamEyeROpen", "ParamEyeLSmile", "ParamEyeRSmile", "ParamMouthForm", "ParamMouthOpenY", "ParamBrowLY", "ParamBrowRY"];
  let lastPose: number[] = [];
  let transitionPose: number[] = [];
  let transitionStart = -Infinity;
  let lastPosition: { x: number; y: number } | null = null;
  let transitionPosition: { x: number; y: number } | null = null;

  function beginTransition() {
    transitionPose = lastPose.slice();
    transitionPosition = lastPosition;
    transitionStart = performance.now();
  }

  function blendPose() {
    if (!model) return;
    const core = (model.internalModel as Cubism4InternalModel).coreModel;
    // This rig writes BodyAngleZ as a physics output. Apply the deliberate
    // sway after physics, before transition blending, so it is not erased.
    if (currentAction === "Sway") {
      const pose = softPose("Sway", (performance.now() - reactionStart) / 1000, getPresence().companion, 0);
      core.setParameterValueById("ParamBodyAngleZ", pose.ParamBodyAngleZ);
    }
    const weight = smooth((performance.now() - transitionStart) / 320);
    lastPose = transitionIds.map((id, index) => {
      const target = core.getParameterValueById(id);
      const value = transitionPose.length && weight < 1 ? transitionPose[index] + (target - transitionPose[index]) * weight : target;
      core.setParameterValueById(id, value);
      return value;
    });
    if (transitionPosition) {
      const target = modelMoveFrame === null ? { x: width / 2, y: height / 2 } : { x: model.position.x, y: model.position.y };
      model.position.set(transitionPosition.x + (target.x - transitionPosition.x) * weight,
        transitionPosition.y + (target.y - transitionPosition.y) * weight);
      if (weight >= 1) transitionPosition = null;
    }
    lastPosition = { x: model.position.x, y: model.position.y };
  }

  // Run in the normal focus stage, before Cubism physics. Parameters are
  // restored by Cubism after drawing, so these overlays never accumulate.
  function updatePresence() {
    if (!model) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, now - lastFrame) / 1000);
    lastFrame = now;
    const core = (model.internalModel as Cubism4InternalModel).coreModel;
    const presence = getPresence();
    const soft = isSoftAction(currentAction);
    const idle = currentAction === "Idle";
    const allowGaze = idle || ["Observe", "Relax", "Drowsy"].includes(currentAction);
    const x = allowGaze ? Math.max(-1, Math.min(1, latestFocus.x * 2 - 1)) : 0;
    const y = allowGaze ? Math.max(-1, Math.min(1, 1 - latestFocus.y * 2)) : 0;
    eyeX = approach(eyeX, x, dt, 0.085); eyeY = approach(eyeY, y, dt, 0.085);
    headX = approach(headX, eyeX, dt, 0.24); headY = approach(headY, eyeY, dt, 0.3);
    strokeX = approach(strokeX, presence.strokeX, dt, 0.13);
    if (soft) {
      const elapsed = (now - reactionStart) / 1000;
      for (const [id, value] of Object.entries(softPose(currentAction as SoftAction, elapsed, presence.companion, strokeX))) core.setParameterValueById(id, value);
      const duration = softDuration(currentAction as SoftAction, presence.companion);
      if (elapsed >= duration && finishReaction) {
        // Keep the final sleepy pose while the sleep command crosses IPC.
        // Returning to Idle here would open the eyes for a frame or two.
        if (currentAction !== "Settle") {
          currentAction = "Idle";
          gazeSuppressed = false;
          applyFocus();
        }
        finishReaction?.(true);
        finishReaction = null;
      }
    }
    if (allowGaze) {
      core.addParameterValueById("ParamEyeBallX", eyeX * 0.7);
      core.addParameterValueById("ParamEyeBallY", eyeY * 0.65);
      core.addParameterValueById("ParamAngleX", headX * 20);
      core.addParameterValueById("ParamAngleY", headY * 10);
      core.addParameterValueById("ParamBodyAngleX", headX * 2.5);
      if (idle) {
        const tired = Math.max(0, 35 - presence.companion.energy) / 35;
        core.setParameterValueById("ParamEyeLOpen", 1 - tired * 0.22);
        core.setParameterValueById("ParamEyeROpen", 1 - tired * 0.22);
        core.addParameterValueById("ParamMouthForm", Math.max(0, presence.companion.mood - 55) / 250);
      }
      if (now >= nextBlink) { blinkStart = now; nextBlink = now + 3500 + Math.random() * 2500; }
      const phase = (now - blinkStart) / 1000;
      if (phase < 0.3) {
        const blink = phase < 0.1 ? 1 - smooth(phase / 0.1) : smooth((phase - 0.1) / 0.2);
        core.setParameterValueById("ParamEyeLOpen", core.getParameterValueById("ParamEyeLOpen") * blink);
        core.setParameterValueById("ParamEyeROpen", core.getParameterValueById("ParamEyeROpen") * blink);
      }
    } else { nextBlink = now + 3500; }
  }

  function applyFocus(): void {
    model?.internalModel.focusController.focus(
      gazeSuppressed ? 0 : Math.min(1, Math.max(-1, latestFocus.x * 2 - 1)),
      gazeSuppressed ? 0 : Math.min(1, Math.max(-1, 1 - latestFocus.y * 2)),
      true
    );
  }

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
    finishModelMove?.();
    finishModelMove = null;
  }

  function cancelMotion(): void {
    beginTransition();
    finishReaction?.(false);
    finishReaction = null;
    currentAction = "Idle";
    if (walking) void window.xiaohei?.pet.stopWalk();
    walking = false;
    limbAnimator?.stop(true);
    motionVersion++;
    finishMotion?.(false);
    finishMotion = null;
    cancelModelMove();
    model?.internalModel.motionManager.stopAllMotions();
    gazeSuppressed = false;
    applyFocus();
    resetPose();
    fitModel();
  }

  function resetPose(): void {
    if (!model) return;
    const core = (model.internalModel as Cubism4InternalModel).coreModel;
    for (let index = 0; index < poseDefaults.length; index++) {
      core.setParameterValueByIndex(index, poseDefaults[index]);
    }
    // Stopping a Cubism motion does not undo its last parameter values. Save the
    // neutral baseline too, otherwise the next frame reloads the interrupted pose.
    core.saveParameters();
  }

  async function animateWholeModelMove(group: "Move" | "Bounce" | "Happy", durationMs: number): Promise<void> {
    const currentModel = assertModel();
    cancelModelMove();

    const startedAt = performance.now();

    await new Promise<void>((resolve) => {
      finishModelMove = resolve;
      const tick = (now: number) => {
        if (disposed || model !== currentModel) {
          modelMoveFrame = null;
          resolve();
          return;
        }

        const progress = Math.min((now - startedAt) / durationMs, 1);
        const envelope = Math.sin(Math.PI * progress);
        const bounce = group === "Bounce" ? Math.abs(Math.sin(progress * Math.PI * 2)) : Math.abs(Math.sin(progress * Math.PI * 4));
        const lift = group === "Bounce" ? height * 0.1 : group === "Happy" ? height * 0.025 : 0;
        currentModel.position.set(
          width / 2,
          height / 2 - bounce * lift * envelope
        );

        if (progress >= 1) {
          currentModel.position.set(width / 2, height / 2);
          modelMoveFrame = null;
          finishModelMove = null;
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
    const version = motionVersion;
    const manager = currentModel.internalModel.motionManager;
    gazeSuppressed = group !== "Idle";
    currentAction = group;
    applyFocus();
    const motion = await manager.loadMotion(group, 0);
    if (disposed || version !== motionVersion || model !== currentModel) {
      return false;
    }
    if (!motion) {
      throw new Error(`Motion ${group} could not be loaded`);
    }
    // Sleep and idle persist; action buttons play one complete cycle.
    motion.setIsLoop(!shouldReturnToIdle(group));
    const motionPriority = force ? priorities?.FORCE : priorities?.IDLE;
    let resolveCompletion: (completed: boolean) => void = () => {};
    const completion = new Promise<boolean>((resolve) => { resolveCompletion = resolve; });
    let started = false;
    const finish = (completed: boolean) => {
      manager.off("motionFinish", onFinish);
      if (finishMotion === finish) finishMotion = null;
      resolveCompletion(completed);
    };
    const onFinish = () => {
      if (!started || disposed || version !== motionVersion) return;
      beginTransition();
      limbAnimator?.stop(true);
      resetPose();
      currentAction = "Idle";
      gazeSuppressed = false;
      applyFocus();
      console.info(`[live2d] motion ${group}: finished`);
      finish(true);
    };
    if (shouldReturnToIdle(group)) {
      finishMotion = finish;
      manager.on("motionFinish", onFinish);
    }
    try {
      started = await currentModel.motion(group, 0, motionPriority);
      if (started && version === motionVersion) limbAnimator?.start(group, motion.getLoopDuration());
      console.info(`[live2d] motion ${group}: ${started ? "started" : "skipped"}`);
      if (!started || disposed || version !== motionVersion) {
        finish(false);
        return false;
      }
      if (group === "Move" && window.xiaohei) {
        walking = true;
        const internal = currentModel.internalModel as Cubism4InternalModel;
        await window.xiaohei.pet.startWalk(internal.pixelsPerUnit * currentModel.scale.x);
        if (version !== motionVersion) return false;
      }
      if (group === "Move" || group === "Bounce" || group === "Happy") {
        const [completed] = await Promise.all([
          completion, animateWholeModelMove(group, motion.getLoopDuration() * 1000)
        ]);
        return completed;
      }
      return shouldReturnToIdle(group) ? completion : true;
    } catch (error) {
      finish(false);
      throw error;
    }
  }

  return {
    async load(modelPath: string, targetCanvas: HTMLCanvasElement): Promise<void> {
      if (!isLive2DModelPath(modelPath)) {
        throw new Error(`Unsupported Live2D model path: ${modelPath}`);
      }

      disposed = false;
      const { PIXI, live2d } = await loadPixiRuntime();
      if (disposed) return;
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
          const loadedModel = await live2d.Live2DModel.from(url, {
            autoInteract: false,
            motionPreload: live2d.MotionPreloadStrategy.ALL,
            idleMotionGroup: "Idle"
          });
          if (disposed) {
            loadedModel.destroy();
            return;
          }
          model = loadedModel;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!model) {
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }

      // Live2DModel.from already registers its ticker. Registering again doubles
      // elapsed time and makes every animation play at twice its intended speed.
      const internal = model.internalModel as Cubism4InternalModel;
      limbAnimator = createLimbAnimator(internal.coreModel as unknown as LimbCore);
      // Set direction before physics so the model's secondary head/body
      // controls follow the turn, instead of only moving the pupils.
      internal.on?.("afterMotionUpdate", limbAnimator.applyFacing);
      const focusStage = internal as unknown as { updateFocus: () => void };
      originalUpdateFocus = focusStage.updateFocus;
      focusStage.updateFocus = updatePresence;
      internal.on?.("beforeModelUpdate", blendPose);
      unsubscribeWalk = window.xiaohei?.pet.onWalkFrame((frame) => {
        if (walking) limbAnimator?.setWalkFrame(frame);
      }) ?? null;
      poseDefaults = Array.from({ length: internal.coreModel.getParameterCount() }, (_, index) =>
        internal.coreModel.getParameterDefaultValue(index)
      );
      // The runtime's generic breath also rotates the head by several degrees,
      // even with neutral gaze. Keep body breathing; motions own head gestures.
      internal.breath.setParameters([
        { parameterId: "ParamBreath", offset: 0, peak: 0.5, cycle: 3.2345, weight: 0.5 }
      ]);
      app.stage.addChild(model);
      fitModel();
      await startMotion("Idle", false);
    },

    async playMotion(group: MotionGroup, options?: { restart?: boolean }): Promise<boolean> {
      assertModel();
      cancelMotion();
      return startMotion(group, group !== "Idle" || Boolean(options?.restart));
    },

    async playModelMove(): Promise<boolean> {
      assertModel();
      cancelMotion();
      return startMotion("Move", true);
    },

    async playReaction(action) {
      cancelMotion();
      const version = motionVersion;
      await startMotion("Idle", false);
      if (disposed || version !== motionVersion) return false;
      currentAction = action;
      reactionStart = performance.now();
      gazeSuppressed = !["Observe", "Relax", "Drowsy"].includes(action);
      applyFocus();
      if (action === "Stroke") return true;
      return new Promise<boolean>((resolve) => { finishReaction = resolve; });
    },

    cancelMotion,

    hitTestHead(point) {
      if (!model || disposed) return false;
      const internal = model.internalModel as Cubism4InternalModel;
      const index = internal.coreModel.getDrawableIndex("ArtMesh58");
      if (index < 0) return false;
      const bounds = internal.getDrawableBounds(index);
      const local = internal.localTransform.applyInverse(model.worldTransform.applyInverse(point));
      const x = (local.x - bounds.x - bounds.width / 2) / (bounds.width / 2);
      const y = (local.y - bounds.y - bounds.height / 2) / (bounds.height / 2);
      return x * x + y * y <= 1;
    },

    hitTest(point) {
      if (!model || disposed) return "none";
      const internal = model.internalModel as Cubism4InternalModel;
      const local = internal.localTransform.applyInverse(model.worldTransform.applyInverse(point));
      const headIndex = internal.coreModel.getDrawableIndex("ArtMesh58");
      if (headIndex >= 0) {
        const b = internal.getDrawableBounds(headIndex);
        if (b.width > 0 && b.height > 0) {
          const result = classifyHeadPoint((local.x - b.x - b.width / 2) / (b.width / 2), (local.y - b.y - b.height / 2) / (b.height / 2));
          if (result !== "none") return result;
        }
      }
      for (const name of ["ArtMesh46", "ArtMesh54", "ArtMesh55", "ArtMesh51", "ArtMesh52", "ArtMesh53", "ArtMesh60", "ArtMesh66", "ArtMesh68"]) {
        const index = internal.coreModel.getDrawableIndex(name);
        if (index < 0) continue;
        const b = internal.getDrawableBounds(index);
        if (local.x >= b.x && local.x <= b.x + b.width && local.y >= b.y && local.y <= b.y + b.height) return "body";
      }
      return "none";
    },

    getFaceAnchor() {
      if (!model || disposed) return null;
      const internal = model.internalModel as Cubism4InternalModel;
      const index = internal.coreModel.getDrawableIndex("ArtMesh58");
      if (index < 0) return null;
      const bounds = internal.getDrawableBounds(index);
      const point = model.toGlobal(internal.localTransform.apply({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }));
      return { x: point.x, y: point.y, width: Math.abs(bounds.width * internal.localTransform.a * model.scale.x), height: Math.abs(bounds.height * internal.localTransform.d * model.scale.y) };
    },

    getHeadAnchor() {
      if (!model || disposed) return null;
      const internal = model.internalModel as Cubism4InternalModel;
      const index = internal.coreModel.getDrawableIndex("ArtMesh58");
      if (index < 0) return null;
      const bounds = internal.getDrawableBounds(index);
      // Touch the crown beside the top ornament, rather than the ornament.
      const point = model.toGlobal(internal.localTransform.apply({
        x: bounds.x + bounds.width * 0.3,
        y: bounds.y + bounds.height * 0.14
      }));
      return { x: point.x, y: point.y, width: Math.abs(bounds.width * internal.localTransform.a * model.scale.x) * 0.45 };
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
      latestFocus = point;
      applyFocus();
    },

    resize(nextWidth: number, nextHeight: number): void {
      if (nextWidth <= 0 || nextHeight <= 0) {
        throw new Error("Canvas size must be positive");
      }

      width = Math.floor(nextWidth);
      height = Math.floor(nextHeight);
      app?.renderer.resize(width, height);
      fitModel();
      transitionPosition = null;
      lastPosition = model ? { x: model.position.x, y: model.position.y } : null;
    },

    dispose(): void {
      disposed = true;
      cancelMotion();
      model?.internalModel.off?.("beforeModelUpdate", blendPose);
      if (model && originalUpdateFocus) (model.internalModel as unknown as { updateFocus: () => void }).updateFocus = originalUpdateFocus;
      if (limbAnimator) model?.internalModel.off?.("afterMotionUpdate", limbAnimator.applyFacing);
      limbAnimator?.dispose();
      limbAnimator = null;
      unsubscribeWalk?.();
      unsubscribeWalk = null;
      model = null;
      poseDefaults = [];
      priorities = null;
      app?.destroy(true, { children: true, texture: true, baseTexture: true });
      app = null;
    }
  };
}
