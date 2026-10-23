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
import { PatHand } from "./PatHand.js";
import { advanceCompanion, COMPANION_STORAGE_KEY, restoreCompanion, rewardInteraction, type CompanionState, type TouchTarget } from "./behavior/companion.js";
import { ActionEffects } from "./ActionEffects.js";
import "./styles.css";
import { useAutonomy } from "./behavior/useAutonomy.js";

type LoadState = "config" | "model" | "ready";
const COOLDOWN_MS = 700;
const QUIET_IDLE_RANGE_MS = [18000, 30000] as const;
const ACTIVE_IDLE_RANGE_MS = [7000, 14000] as const;

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function PetApp() {
  const [companion, setCompanion] = useState<CompanionState>(() => {
    try { return restoreCompanion(JSON.parse(localStorage.getItem(COMPANION_STORAGE_KEY) ?? "null")); }
    catch { return restoreCompanion(null); }
  });
  const presenceRef = useRef({ companion, strokeX: 0 });
  const cancelInputRef = useRef<(() => void) | null>(null);
  const strokeOriginRef = useRef(0);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("config");
  const [command, setCommand] = useState<Live2DCommand>({ id: 0, action: "Idle" });
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [behaviorState, setBehaviorState] = useState("idle");
  const [visualAction, setVisualAction] = useState<{ id: number; action: Live2DAction }>({ id: 0, action: "Idle" });
  const machineRef = useRef<BehaviorMachine>(createBehaviorMachine("quiet"));
  const modelPathRef = useRef<string | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const hitAreaRef = useRef<HTMLDivElement | null>(null);
  const touchHitTestRef = useRef<((point: { x: number; y: number }) => TouchTarget) | null>(null);
  const headAnchorRef = useRef<(() => { x: number; y: number; width: number } | null) | null>(null);
  const autonomyRef = useRef<ReturnType<typeof useAutonomy> | null>(null);

  useEffect(() => {
    window.xiaohei.status.publish({
      energy: companion.energy,
      mood: companion.mood,
      activity: error ? "error" : loadState !== "ready" ? "loading"
        : behaviorState === "sleeping" ? "sleeping" : behaviorState === "stroking" ? "stroking"
        : ["clicked", "dragging"].includes(behaviorState) ? "playing" : "awake"
    });
  }, [companion, behaviorState, loadState, error]);

  useEffect(() => {
    let previous = Date.now();
    let ticks = 0;
    const save = () => { try { localStorage.setItem(COMPANION_STORAGE_KEY, JSON.stringify(presenceRef.current.companion)); } catch { /* Storage may be unavailable. */ } };
    const timer = window.setInterval(() => {
      const now = Date.now();
      const state = machineRef.current.snapshot().state;
      const next = advanceCompanion(presenceRef.current.companion, (now - previous) / 1000, state === "sleeping" ? "sleeping" : state === "stroking" ? "stroking" : "awake", now);
      previous = now;
      presenceRef.current.companion = next;
      setCompanion(next);
      if (++ticks % 15 === 0) save();
    }, 1000);
    window.addEventListener("pagehide", save);
    return () => { window.clearInterval(timer); window.removeEventListener("pagehide", save); save(); };
  }, []);

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
    let configChanged = false;

    window.xiaohei.config
      .get()
      .then((nextConfig) => {
        if (active && !configChanged) {
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
      configChanged = true;
      const modelChanged = modelPathRef.current !== nextConfig.pet.modelPath;
      modelPathRef.current = nextConfig.pet.modelPath;
      setConfig(nextConfig);
      setError(null);
      if (modelChanged) {
        cancelInputRef.current?.();
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

  const send = useCallback((event: BehaviorEvent, autonomous = false) => {
    const machine = machineRef.current;
    if (!machine.send(event)) {
      return;
    }
    if (!autonomous && ["click", "double:click", "hold:start", "hold:end", "drag:start", "drag:end", "action"].includes(event.type)) {
      autonomyRef.current?.interact(["action", "drag:start", "drag:end"].includes(event.type) ? "manual" : "attention");
    }
    if (
      event.type === "click" ||
      event.type === "double:click" ||
      event.type === "hold:start" ||
      event.type === "drag:start" ||
      event.type === "action" ||
      event.type === "recover" ||
      event.type === "error"
    ) {
      clearCooldownTimer();
    }
    setBehaviorState(machine.snapshot().state);
    if (event.type === "drag:start") {
      setCommand((current) => ({ id: current.id + 1, action: "none" }));
    }
    triggerAction(machine.snapshot().nextAction);
  }, [clearCooldownTimer, triggerAction]);

  const autonomy = useAutonomy({
    config, ready: loadState === "ready" && !error, state: behaviorState, visualAction: visualAction.action, companion,
    anchor: () => {
      const anchor = headAnchorRef.current?.();
      const bounds = hitAreaRef.current?.getBoundingClientRect();
      return anchor && bounds ? { ...anchor, x: anchor.x + bounds.left + anchor.width * 0.44, y: anchor.y + bounds.top } : null;
    },
    act: (action) => send({ type: "action", action }, true)
  });
  autonomyRef.current = autonomy;

  useEffect(() => window.xiaohei.pet.onActionTriggered((action) => {
    cancelInputRef.current?.();
    send({ type: "action", action });
  }), [send]);

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
    const schedule = () => {
      const delay = minMs + Math.round(Math.random() * (maxMs - minMs));
      idleTimerRef.current = window.setTimeout(() => {
        idleTimerRef.current = null;
        if (autonomyRef.current?.canPlayIdle()) send({ type: "idle:tick" }, true);
        schedule();
      }, delay);
    };
    schedule();

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

  const clickTarget = useCallback((point: { x: number; y: number }): TouchTarget => {
    const bounds = hitAreaRef.current?.getBoundingClientRect();
    return bounds ? touchHitTestRef.current?.({ x: point.x - bounds.left, y: point.y - bounds.top }) ?? "none" : "none";
  }, []);

  const updateStroke = useCallback((point: { x: number; y: number }) => {
    const bounds = hitAreaRef.current?.getBoundingClientRect();
    if (!bounds) return;
    presenceRef.current.strokeX = Math.max(-1, Math.min(1, (point.x - strokeOriginRef.current) / (bounds.width * 0.16)));
    hitAreaRef.current?.style.setProperty("--touch-x", `${point.x - bounds.left}px`);
    hitAreaRef.current?.style.setProperty("--touch-y", `${point.y - bounds.top}px`);
  }, []);

  const inputHandlers = useMemo(
    () => ({
      locked: config?.window.locked ?? false,
      targetAt: clickTarget,
      canStroke: () => !["sleeping", "error", "dragging"].includes(machineRef.current.snapshot().state),
      onStrokeStart: (point: { x: number; y: number }) => {
        strokeOriginRef.current = point.x;
        updateStroke(point);
        send({ type: "hold:start" });
      },
      onStrokeMove: updateStroke,
      onStrokeEnd: () => { presenceRef.current.strokeX = 0; send({ type: "hold:end" }); finishCooldownSoon(); },
      onClick: (point: { x: number; y: number }) => send({ type: "click", target: clickTarget(point) }),
      onDoubleClick: (point: { x: number; y: number }) => send({ type: "double:click", target: clickTarget(point) }),
      onDragStart: () => {
        startDrag();
        send({ type: "drag:start" });
      },
      onDragMove: moveDrag,
      onDragEnd: (delta: { dx: number; dy: number }) => {
        send({ type: "drag:end" });
        finishCooldownSoon();
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
    [config, endDrag, finishCooldownSoon, moveDrag, send, startDrag, clickTarget, updateStroke]
  );
  const input = usePetInput(inputHandlers);
  cancelInputRef.current = input.cancel;

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
    if (autonomyRef.current?.finishRest()) return;
    autonomyRef.current?.finishActivity();
    setVisualAction((current) => ({ id: current.id + 1, action: "Idle" }));
    send({ type: "motion:finished" });
    if (machineRef.current.snapshot().state === "cooldown") {
      finishCooldownSoon();
    }
  }, [finishCooldownSoon, send]);

  const handleActionStarted = useCallback((action: Live2DAction) => {
    const next = rewardInteraction(presenceRef.current.companion, action, autonomyRef.current?.activity !== action);
    presenceRef.current.companion = next;
    setCompanion(next);
    if (action === "Sleep") {
      machineRef.current.send({ type: "sleep:started" });
      setBehaviorState(machineRef.current.snapshot().state);
    }
    setVisualAction((current) => ({ id: current.id + 1, action }));
  }, []);

  if (error) {
    return <div className="pet-message pet-error">模型加载失败: {error}</div>;
  }

  if (!config) {
    return <div className="pet-message">加载中</div>;
  }

  return (
    <main className="pet-root" data-action={command.action} data-autonomy={autonomy.phase} data-visual-action={visualAction.action} data-behavior-state={behaviorState} data-energy={companion.energy.toFixed(2)} data-mood={companion.mood.toFixed(2)}>
      <div ref={hitAreaRef} className="pet-hit-area" {...input.bindings}>
        {loadState !== "ready" ? <div className="pet-message pet-overlay">加载中</div> : null}
        <Live2DCanvas
          modelPath={config.pet.modelPath}
          command={command}
          focusPoint={focusPoint}
          onReady={handleModelReady}
          onError={handleModelError}
          onMotionFinished={handleMotionFinished}
          onActionStarted={handleActionStarted}
          touchHitTestRef={touchHitTestRef}
          headAnchorRef={headAnchorRef}
          presenceRef={presenceRef}
        />
        {behaviorState === "stroking" ? <span className="stroke-touch" aria-hidden="true" /> : null}
        <div key={visualAction.id} className="pet-gesture" aria-hidden="true">
          <ActionEffects action={visualAction.action} />
          {visualAction.action === "Greet" ? <span className="gesture-greeting">你好呀</span> : null}
          {visualAction.action === "Pat" ? <PatHand /> : null}
          {visualAction.action === "Curious" ? <span className="gesture-curious">？</span> : null}
          {visualAction.action === "Happy" ? <span className="gesture-heart">♥</span> : null}
          {visualAction.action === "Sleep" ? <span className="gesture-sleep">z Z z</span> : null}
        </div>
      </div>
    </main>
  );
}
