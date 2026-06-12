import { useCallback, useEffect, useRef, type PointerEvent } from "react";

const DRAG_THRESHOLD_PX = 4;
const DOUBLE_CLICK_MS = 260;

interface PetInputHandlers {
  locked: boolean;
  onClick(): void;
  onDoubleClick(): void;
  onDragStart(): void;
  onDragMove(delta: { dx: number; dy: number }): void;
  onDragEnd(delta: { dx: number; dy: number }): void;
  onHoverStart(): void;
  onHoverEnd(): void;
  onFocus(point: { x: number; y: number }): void;
}

interface PointerStart {
  pointerId: number;
  mouseX: number;
  mouseY: number;
}

export function usePetInput(handlers: PetInputHandlers) {
  const dragging = useRef(false);
  const moved = useRef(false);
  const start = useRef<PointerStart | null>(null);
  const currentDelta = useRef<{ dx: number; dy: number } | null>(null);
  const clickTimer = useRef<number | null>(null);

  const clearClickTimer = useCallback(() => {
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearClickTimer();
    };
  }, [clearClickTimer]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (handlers.locked || event.button !== 0) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      dragging.current = false;
      moved.current = false;
      start.current = {
        pointerId: event.pointerId,
        mouseX: event.screenX,
        mouseY: event.screenY
      };
    },
    [handlers]
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const origin = start.current;
      if (!dragging.current) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          handlers.onFocus({
            x: (event.clientX - rect.left) / rect.width,
            y: (event.clientY - rect.top) / rect.height
          });
        }
      }

      if (!origin || origin.pointerId !== event.pointerId) {
        return;
      }

      const dx = event.screenX - origin.mouseX;
      const dy = event.screenY - origin.mouseY;
      if (!moved.current && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        moved.current = true;
        dragging.current = true;
        handlers.onDragStart();
      }

      if (dragging.current) {
        currentDelta.current = {
          dx: Math.round(dx),
          dy: Math.round(dy)
        };
        handlers.onDragMove(currentDelta.current);
      }
    },
    [handlers]
  );

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const origin = start.current;
      if (!origin || origin.pointerId !== event.pointerId) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      start.current = null;
      if (dragging.current) {
        dragging.current = false;
        handlers.onDragEnd(currentDelta.current ?? { dx: 0, dy: 0 });
        currentDelta.current = null;
        return;
      }

      if (!moved.current) {
        if (clickTimer.current !== null) {
          clearClickTimer();
          handlers.onDoubleClick();
          return;
        }

        clickTimer.current = window.setTimeout(() => {
          clickTimer.current = null;
          handlers.onClick();
        }, DOUBLE_CLICK_MS);
      }
    },
    [clearClickTimer, handlers]
  );

  const onPointerCancel = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!start.current || start.current.pointerId !== event.pointerId) {
        return;
      }

      start.current = null;
      if (dragging.current) {
        dragging.current = false;
        handlers.onDragEnd(currentDelta.current ?? { dx: 0, dy: 0 });
        currentDelta.current = null;
      }
    },
    [handlers]
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerEnter: handlers.onHoverStart,
    onPointerLeave: handlers.onHoverEnd
  };
}
