import { useEffect, useRef, useState } from "react";
import { createLive2DAdapter, type Live2DAdapter } from "./Live2DAdapter.js";
import type { Live2DAction } from "../behavior/behaviorMachine.js";
import { isPetReactionName, type PetExpressionName, type PetMotionName } from "../../../shared/actions.js";
import { chooseIdle, isSoftAction, type CompanionState, type SoftAction, type TouchTarget } from "../behavior/companion.js";

export interface Live2DCommand {
  id: number;
  action: Live2DAction;
}

interface Live2DCanvasProps {
  modelPath: string;
  command: Live2DCommand;
  focusPoint: { x: number; y: number } | null;
  onReady(): void;
  onError(error: Error): void;
  onMotionFinished(): void;
  onActionStarted(action: Live2DAction): void;
  touchHitTestRef: { current: ((point: { x: number; y: number }) => TouchTarget) | null };
  headAnchorRef: { current: (() => { x: number; y: number; width: number } | null) | null };
  presenceRef: { current: { companion: CompanionState; strokeX: number } };
}

const MOTION_ACTIONS = new Set<Live2DAction>([
  "Idle",
  "Bounce",
  "Sleep",
  "Wake",
  "Greet",
  "Curious",
  "Happy",
  "Pat",
  "Move"
]);
const EXPRESSION_ACTIONS = new Set<Live2DAction>(["hair"]);

function isMotionAction(action: Live2DAction): action is PetMotionName {
  return MOTION_ACTIONS.has(action);
}

function isExpressionAction(action: Live2DAction): action is PetExpressionName {
  return EXPRESSION_ACTIONS.has(action);
}

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomNonRepeating<T>(items: readonly T[], previous: T | null): T {
  const candidates = items.filter((item) => item !== previous);
  return randomItem(candidates.length > 0 ? candidates : items);
}

export function Live2DCanvas({
  modelPath,
  command,
  focusPoint,
  onReady,
  onError,
  onMotionFinished,
  onActionStarted,
  touchHitTestRef,
  headAnchorRef,
  presenceRef
}: Live2DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const adapterRef = useRef<Live2DAdapter | null>(null);
  const lastTapActionRef = useRef<"Greet" | "Curious" | "Happy" | "Pat" | null>(null);
  const lastIdleActionRef = useRef<SoftAction | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready || (command.action !== "Pat" && command.action !== "Tap" && !isPetReactionName(command.action))) return;
    let frame = 0;
    const update = () => {
      const anchor = adapterRef.current?.getHeadAnchor();
      const target = canvasRef.current?.closest<HTMLElement>(".pet-hit-area");
      if (anchor && target) {
        target.style.setProperty("--pat-x", `${anchor.x}px`);
        target.style.setProperty("--pat-y", `${anchor.y}px`);
        target.style.setProperty("--pat-width", `${anchor.width}px`);
      }
      const face = adapterRef.current?.getFaceAnchor();
      if (face && target) {
        target.style.setProperty("--face-x", `${face.x}px`);
        target.style.setProperty("--face-y", `${face.y}px`);
        target.style.setProperty("--face-width", `${face.width}px`);
        target.style.setProperty("--face-height", `${face.height}px`);
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [ready, command.id, command.action]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    let active = true;
    const adapter = createLive2DAdapter(() => presenceRef.current);
    adapterRef.current = adapter;
    touchHitTestRef.current = (point) => adapter.hitTest(point);
    headAnchorRef.current = () => adapter.getHeadAnchor();
    setReady(false);

    adapter
      .load(modelPath, canvas)
      .then(() => {
        if (!active) {
          return;
        }

        setReady(true);
        onReady();
      })
      .catch((error: Error) => {
        if (active) {
          onError(error);
        }
      });

    return () => {
      active = false;
      adapter.dispose();
      if (adapterRef.current === adapter) {
        adapterRef.current = null;
        touchHitTestRef.current = null;
        headAnchorRef.current = null;
      }
    };
  }, [modelPath, onError, onReady, touchHitTestRef, presenceRef, headAnchorRef]);

  useEffect(() => {
    const action = command.action;
    console.info(`[live2d] command ${command.id}: ${action}, ready=${ready}`);
    if (action === "none") onActionStarted(action);
    if (!ready || action === "none") {
      return;
    }

    const adapter = adapterRef.current;
    if (!adapter) {
      console.info(`[live2d] command ${command.id}: adapter not ready`);
      return;
    }
    let active = true;

    const run = async (): Promise<void> => {
      const playComposite = async (nextAction: Live2DAction): Promise<boolean> => {
        onActionStarted(nextAction);
        if (nextAction === "DragStart") {
          return adapter.playMotion("Idle", { restart: true });
        }

        if (nextAction === "Move") {
          return adapter.playModelMove();
        }

        if (isMotionAction(nextAction)) {
          return adapter.playMotion(nextAction, { restart: true });
        }

        if (isExpressionAction(nextAction)) {
          await adapter.setExpression(nextAction, { restart: true });
        }
        return false;
      };

      if (action === "Tap") {
        const nextAction = randomNonRepeating(
          ["Greet", "Curious", "Happy", "Pat"] as const,
          lastTapActionRef.current
        );
        lastTapActionRef.current = nextAction;
        if (await playComposite(nextAction) && active) onMotionFinished();
        return;
      }

      if (action === "IdleVariant") {
        const nextAction = chooseIdle(presenceRef.current.companion, lastIdleActionRef.current);
        lastIdleActionRef.current = nextAction;
        onActionStarted(nextAction);
        if (await adapter.playReaction(nextAction) && active) onMotionFinished();
        return;
      }

      if (isSoftAction(action)) {
        onActionStarted(action);
        const completed = await adapter.playReaction(action);
        if (action !== "Stroke" && completed && active) onMotionFinished();
        return;
      }

      if (
        action === "Greet" ||
        action === "Happy" ||
        action === "Curious" ||
        action === "Pat" ||
        action === "Move" ||
        action === "DragStart"
      ) {
        if (await playComposite(action) && active) onMotionFinished();
        return;
      }

      if (isMotionAction(action)) {
        onActionStarted(action);
        const completed = await adapter.playMotion(action, { restart: true });
        if (completed && active && action !== "Idle" && action !== "Sleep") {
          onMotionFinished();
        }
        return;
      }

      if (isExpressionAction(action)) {
        onActionStarted(action);
        await adapter.setExpression(action, { restart: true });
      }
    };

    void run().catch((error: Error) => { if (active) onError(error); });
    return () => {
      active = false;
      adapter.cancelMotion();
    };
  }, [command, onActionStarted, onError, onMotionFinished, ready, presenceRef]);

  useEffect(() => {
    if (!ready || !focusPoint) {
      return;
    }

    adapterRef.current?.focus(focusPoint);
  }, [focusPoint, ready]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const adapter = adapterRef.current;
    const resizeTarget = canvas?.parentElement;
    if (!canvas || !resizeTarget || !adapter) {
      return;
    }

    let currentWidth = 0;
    let currentHeight = 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) {
        return;
      }
      if (Math.round(width) === currentWidth && Math.round(height) === currentHeight) {
        return;
      }

      try {
        currentWidth = Math.round(width);
        currentHeight = Math.round(height);
        adapter.resize(currentWidth, currentHeight);
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    });

    observer.observe(resizeTarget);
    return () => observer.disconnect();
  }, [onError, ready]);

  return (
    <div className="live2d-stage" aria-label="Live2D pet">
      <canvas ref={canvasRef} className="live2d-canvas" width={720} height={1040} />
    </div>
  );
}
