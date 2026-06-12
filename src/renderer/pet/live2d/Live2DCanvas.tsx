import { useEffect, useRef, useState } from "react";
import { createLive2DAdapter, type Live2DAdapter } from "./Live2DAdapter.js";
import type { Live2DAction } from "../behavior/behaviorMachine.js";
import type { PetExpressionName, PetMotionName } from "../../../shared/actions.js";

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
  onMotionFinished
}: Live2DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const adapterRef = useRef<Live2DAdapter | null>(null);
  const lastTapActionRef = useRef<"Greet" | "Curious" | "Happy" | "Pat" | null>(null);
  const lastIdleActionRef = useRef<"Idle" | "Sleep" | "Greet" | "Curious" | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    let active = true;
    const adapter = createLive2DAdapter();
    adapterRef.current = adapter;
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
      }
    };
  }, [modelPath, onError, onReady]);

  useEffect(() => {
    const action = command.action;
    console.info(`[live2d] command ${command.id}: ${action}, ready=${ready}`);
    if (!ready || action === "none") {
      return;
    }

    const adapter = adapterRef.current;
    if (!adapter) {
      console.info(`[live2d] command ${command.id}: adapter not ready`);
      return;
    }

    const run = async (): Promise<void> => {
      const playComposite = async (nextAction: Live2DAction): Promise<void> => {
        if (nextAction === "DragStart") {
          await adapter.playModelMove();
          return;
        }

        if (nextAction === "Move") {
          await adapter.playModelMove();
          return;
        }

        if (isMotionAction(nextAction)) {
          await adapter.playMotion(nextAction, { restart: true });
          return;
        }

        if (isExpressionAction(nextAction)) {
          await adapter.setExpression(nextAction, { restart: true });
        }
      };

      if (action === "Tap") {
        const nextAction = randomNonRepeating(
          ["Greet", "Curious", "Happy", "Pat"] as const,
          lastTapActionRef.current
        );
        lastTapActionRef.current = nextAction;
        await playComposite(nextAction);
        onMotionFinished();
        return;
      }

      if (action === "IdleVariant") {
        const nextAction = randomNonRepeating(
          ["Idle", "Sleep", "Greet", "Curious"] as const,
          lastIdleActionRef.current
        );
        lastIdleActionRef.current = nextAction;
        await playComposite(nextAction);
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
        await playComposite(action);
        if (action === "Happy") {
          onMotionFinished();
        }
        return;
      }

      if (isMotionAction(action)) {
        await adapter.playMotion(action, { restart: true });
        if (action !== "Idle" && action !== "Sleep") {
          onMotionFinished();
        }
        return;
      }

      if (isExpressionAction(action)) {
        await adapter.setExpression(action, { restart: true });
      }
    };

    void run().catch((error: Error) => onError(error));
  }, [command, onError, onMotionFinished, ready]);

  useEffect(() => {
    if (!ready || !focusPoint) {
      return;
    }

    adapterRef.current?.focus(focusPoint, { instant: true });
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
