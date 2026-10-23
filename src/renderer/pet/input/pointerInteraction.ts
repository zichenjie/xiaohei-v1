import type { TouchTarget } from "../behavior/companion.js";
export interface Point { x: number; y: number; }
export interface PointerSample extends Point { pointerId: number; screenX: number; screenY: number; }
export interface InputHandlers {
  locked: boolean;
  targetAt(point: Point): TouchTarget;
  canStroke(): boolean;
  onClick(point: Point): void;
  onDoubleClick(point: Point): void;
  onStrokeStart(point: Point): void;
  onStrokeMove(point: Point): void;
  onStrokeEnd(): void;
  onDragStart(): void;
  onDragMove(delta: { dx: number; dy: number }): void;
  onDragEnd(delta: { dx: number; dy: number }): void;
  onHoverStart(): void;
  onHoverEnd(): void;
  onFocus(point: Point): void;
}

export function createPointerInteraction(getHandlers: () => InputHandlers) {
  let origin: PointerSample | null = null;
  let current: PointerSample | null = null;
  let mode: "pressed" | "dragging" | "stroking" | "moved" = "pressed";
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let clickTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingClick: { point: Point; target: TouchTarget } | null = null;
  const clearHold = () => { clearTimeout(holdTimer); holdTimer = undefined; };
  const clearClick = () => { clearTimeout(clickTimer); clickTimer = undefined; pendingClick = null; };
  const delta = () => ({ dx: Math.round(current!.screenX - origin!.screenX), dy: Math.round(current!.screenY - origin!.screenY) });

  function cancel() {
    clearHold();
    clearClick();
    if (origin && mode === "stroking") getHandlers().onStrokeEnd();
    if (origin && mode === "dragging") getHandlers().onDragEnd(delta());
    origin = current = null;
    mode = "pressed";
  }

  return {
    cancel,
    lostCapture() { if (origin) cancel(); },
    lockChanged() { if (getHandlers().locked && mode === "dragging") cancel(); },
    down(point: PointerSample) {
      if (origin || getHandlers().targetAt(point) === "none") return false;
      origin = current = point;
      mode = "pressed";
      if (getHandlers().targetAt(point) === "head" && getHandlers().canStroke()) {
        holdTimer = setTimeout(() => {
          if (!origin || mode !== "pressed" || !getHandlers().canStroke()) return;
          clearClick();
          mode = "stroking";
          getHandlers().onStrokeStart(current!);
        }, 280);
      }
      return true;
    },
    move(point: PointerSample) {
      if (!origin || point.pointerId !== origin.pointerId) return;
      current = point;
      if (mode === "stroking") { getHandlers().onStrokeMove(point); return; }
      const movement = delta();
      if (mode === "pressed" && Math.hypot(movement.dx, movement.dy) >= 6) {
        clearHold();
        clearClick();
        mode = getHandlers().locked ? "moved" : "dragging";
        if (mode === "dragging") getHandlers().onDragStart();
      }
      if (mode === "dragging") getHandlers().onDragMove(movement);
    },
    up(point: PointerSample) {
      if (!origin || point.pointerId !== origin.pointerId) return;
      current = point;
      clearHold();
      const handlers = getHandlers();
      if (mode === "stroking") handlers.onStrokeEnd();
      else if (mode === "dragging") handlers.onDragEnd(delta());
      else if (mode === "pressed") {
        const target = handlers.targetAt(point);
        if (target !== "none") {
          if (pendingClick && pendingClick.target === target && Math.hypot(pendingClick.point.x - point.x, pendingClick.point.y - point.y) < 18) {
            clearClick();
            handlers.onDoubleClick(point);
          } else {
            if (pendingClick) handlers.onClick(pendingClick.point);
            clearClick();
            pendingClick = { point, target };
            clickTimer = setTimeout(() => {
              const saved = pendingClick;
              clearClick();
              if (saved) getHandlers().onClick(saved.point);
            }, 240);
          }
        }
      }
      origin = current = null;
      mode = "pressed";
    }
  };
}
