import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppConfig } from "../../shared/types.js";
import {
  createBehaviorMachine,
  type BehaviorEvent,
  type BehaviorMachine,
  type Live2DAction
} from "./behavior/behaviorMachine.js";
import { usePetInput } from "./input/usePetInput.js";
import { Live2DCanvas, type Live2DCommand } from "./live2d/Live2DCanvas.js";
import type { PetActionName } from "../../shared/ipc.js";
import "./styles.css";

type LoadState = "config" | "model" | "ready";
const COOLDOWN_MS = 700;
const QUIET_IDLE_RANGE_MS = [18000, 30000] as const;
const ACTIVE_IDLE_RANGE_MS = [7000, 14000] as const;

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function toLive2DAction(action: PetActionName): Live2DAction {
  return action;
}

export function PetApp() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("config");
  const [command, setCommand] = useState<Live2DCommand>({ id: 0, action: "Idle" });
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [debugSize, setDebugSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [mainBounds, setMainBounds] = useState<{ width: number; height: number } | null>(null);
  const machineRef = useRef<BehaviorMachine>(createBehaviorMachine("quiet"));
  const modelPathRef = useRef<string | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const hitAreaRef = useRef<HTMLDivElement | null>(null);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const clearCooldownTimer = useCallback(() => {
    if (cooldownTimerRef.current !== null) {
      window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    window.xiaohei.config
      .get()
      .then((nextConfig) => {
        if (active) {
          modelPathRef.current = nextConfig.pet.modelPath;
          setConfig(nextConfig);
          setLoadState("model");
        }
      })
      .catch((err: Error) => {
        if (active) {
          setError(err.message);
        }
      });

    const unsubscribe = window.xiaohei.config.onChanged((nextConfig) => {
      const modelChanged = modelPathRef.current !== nextConfig.pet.modelPath;
      modelPathRef.current = nextConfig.pet.modelPath;
      setConfig(nextConfig);
      setError(null);
      if (modelChanged) {
        setLoadState("model");
      }
    });

    return () => {
      active = false;
      clearCooldownTimer();
      clearIdleTimer();
      unsubscribe();
    };
  }, [clearCooldownTimer, clearIdleTimer]);

  useEffect(() => {
    if (!config) {
      return;
    }

    machineRef.current.setMode(config.pet.behaviorMode);
  }, [config?.pet.behaviorMode]);

  const triggerAction = useCallback((action: Live2DAction) => {
    if (action === "none") {
      return;
    }

    setCommand((current) => ({ id: current.id + 1, action }));
  }, []);

  useEffect(() => {
    return window.xiaohei.pet.onActionTriggered((action) => {
      console.log(`Pet action triggered: ${action}`);
      clearCooldownTimer();
      clearIdleTimer();
      triggerAction(toLive2DAction(action));
    });
  }, [clearCooldownTimer, clearIdleTimer, triggerAction]);

  useEffect(() => {
    const updateDebugSize = () => setDebugSize({ width: window.innerWidth, height: window.innerHeight });
    updateDebugSize();
    window.addEventListener("resize", updateDebugSize);
    return () => window.removeEventListener("resize", updateDebugSize);
  }, []);

  useEffect(() => {
    return window.xiaohei.pet.onBoundsChanged((bounds) => {
      setMainBounds({ width: bounds.width, height: bounds.height });
    });
  }, []);

  const send = useCallback((event: BehaviorEvent) => {
    const machine = machineRef.current;
    if (
      event.type === "click" ||
      event.type === "double:click" ||
      event.type === "hold:start" ||
      event.type === "drag:start" ||
      event.type === "error"
    ) {
      clearCooldownTimer();
      clearIdleTimer();
    }
    machine.send(event);
    triggerAction(machine.snapshot().nextAction);
  }, [clearCooldownTimer, clearIdleTimer, triggerAction]);

  const finishCooldownSoon = useCallback(() => {
    clearCooldownTimer();
    cooldownTimerRef.current = window.setTimeout(() => {
      cooldownTimerRef.current = null;
      send({ type: "cooldown:finished" });
    }, COOLDOWN_MS);
  }, [clearCooldownTimer, send]);

  useEffect(() => {
    if (!config || loadState !== "ready") {
      return;
    }

    const [minMs, maxMs] = config.pet.behaviorMode === "active" ? ACTIVE_IDLE_RANGE_MS : QUIET_IDLE_RANGE_MS;
    const delay = minMs + Math.round(Math.random() * (maxMs - minMs));
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      send({ type: "idle:tick" });
    }, delay);

    return clearIdleTimer;
  }, [clearIdleTimer, command.id, config?.pet.behaviorMode, loadState, send]);

  const startDrag = useCallback(() => {
    void window.xiaohei.pet.startDrag().catch((err: Error) => setError(err.message));
  }, []);

  const moveDrag = useCallback((delta: { dx: number; dy: number }) => {
    void window.xiaohei.pet.moveDrag(delta).catch((err: Error) => setError(err.message));
  }, []);

  const endDrag = useCallback((delta: { dx: number; dy: number }) => {
    void window.xiaohei.pet.endDrag(delta).catch((err: Error) => setError(err.message));
  }, []);

  const inputHandlers = useMemo(
    () => ({
      locked: config?.window.locked ?? false,
      onClick: () => send({ type: "click" }),
      onDoubleClick: () => send({ type: "double:click" }),
      onDragStart: () => {
        startDrag();
        send({ type: "drag:start" });
      },
      onDragMove: moveDrag,
      onDragEnd: (delta: { dx: number; dy: number }) => {
        send({ type: "drag:end" });
        endDrag(delta);
      },
      onHoverStart: () => send({ type: "hover:start" }),
      onHoverEnd: () => {
        setFocusPoint({ x: 0.5, y: 0.5 });
        send({ type: "hover:end" });
      },
      onFocus: (point: { x: number; y: number }) => {
        if (!config?.pet.followMouse) {
          return;
        }

        setFocusPoint((current) => {
          if (current && Math.abs(current.x - point.x) < 0.015 && Math.abs(current.y - point.y) < 0.015) {
            return current;
          }

          return point;
        });
      }
    }),
    [config, endDrag, moveDrag, send, startDrag]
  );
  const input = usePetInput(inputHandlers);

  useEffect(() => {
    if (!config?.pet.followMouse) {
      setFocusPoint({ x: 0.5, y: 0.5 });
      return;
    }

    const updateFocusFromPointer = (event: PointerEvent) => {
      const hitArea = hitAreaRef.current;
      if (!hitArea) {
        return;
      }

      const rect = hitArea.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const point = {
        x: clampUnit((event.clientX - rect.left) / rect.width),
        y: clampUnit((event.clientY - rect.top) / rect.height)
      };

      setFocusPoint((current) => {
        if (current && Math.abs(current.x - point.x) < 0.015 && Math.abs(current.y - point.y) < 0.015) {
          return current;
        }

        return point;
      });
    };

    window.addEventListener("pointermove", updateFocusFromPointer);
    return () => window.removeEventListener("pointermove", updateFocusFromPointer);
  }, [config?.pet.followMouse]);

  useEffect(() => {
    if (!config?.pet.followMouse) {
      return;
    }

    return window.xiaohei.pet.onCursorChanged(({ cursor, bounds }) => {
      const hitArea = hitAreaRef.current;
      if (!hitArea) {
        return;
      }

      const rect = hitArea.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const clientX = cursor.x - bounds.x;
      const clientY = cursor.y - bounds.y;
      const point = {
        x: clampUnit((clientX - rect.left) / rect.width),
        y: clampUnit((clientY - rect.top) / rect.height)
      };

      setFocusPoint((current) => {
        if (current && Math.abs(current.x - point.x) < 0.015 && Math.abs(current.y - point.y) < 0.015) {
          return current;
        }

        return point;
      });
    });
  }, [config?.pet.followMouse]);

  const handleModelReady = useCallback(() => {
    setError(null);
    setLoadState("ready");
    send({ type: "recover" });
  }, [send]);

  const handleModelError = useCallback((err: Error) => {
    machineRef.current.send({ type: "error" });
    triggerAction(machineRef.current.snapshot().nextAction);
    setError(err.message);
  }, [triggerAction]);

  const handleMotionFinished = useCallback(() => {
    send({ type: "motion:finished" });
    finishCooldownSoon();
  }, [finishCooldownSoon, send]);

  if (error) {
    return <div className="pet-message pet-error">模型加载失败: {error}</div>;
  }

  if (!config) {
    return <div className="pet-message">加载中</div>;
  }

  return (
    <main className="pet-root">
      <div className="pet-debug-frame" aria-hidden="true">
        view {debugSize.width}x{debugSize.height}
        {mainBounds ? ` · win ${mainBounds.width}x${mainBounds.height}` : ""} · {command.action}
      </div>
      <div ref={hitAreaRef} className="pet-hit-area" {...input}>
        {loadState !== "ready" ? <div className="pet-message pet-overlay">加载中</div> : null}
        <Live2DCanvas
          modelPath={config.pet.modelPath}
          command={command}
          focusPoint={focusPoint}
          onReady={handleModelReady}
          onError={handleModelError}
          onMotionFinished={handleMotionFinished}
        />
      </div>
    </main>
  );
}
