import { useEffect, useRef, type PointerEvent } from "react";
import { createPointerInteraction, type InputHandlers, type PointerSample } from "./pointerInteraction.js";

export function usePetInput(handlers: InputHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const controllerRef = useRef<ReturnType<typeof createPointerInteraction> | null>(null);
  if (!controllerRef.current) controllerRef.current = createPointerInteraction(() => handlersRef.current);
  const controller = controllerRef.current;
  const sample = (event: PointerEvent): PointerSample => ({
    x: event.clientX, y: event.clientY, screenX: event.screenX, screenY: event.screenY, pointerId: event.pointerId
  });
  useEffect(() => {
    const cancel = () => controller.cancel();
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("blur", cancel); cancel(); };
  }, [controller]);
  useEffect(() => { controller.lockChanged(); }, [controller, handlers.locked]);

  return {
    cancel: controller.cancel,
    bindings: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.button === 0 && controller.down(sample(event))) event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width && rect.height) handlersRef.current.onFocus({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
        controller.move(sample(event));
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        if (event.button !== 0) return;
        controller.up(sample(event));
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      },
      onPointerCancel: controller.cancel,
      onLostPointerCapture: controller.lostCapture,
      onContextMenu: controller.cancel,
      onPointerEnter: handlers.onHoverStart,
      onPointerLeave: handlers.onHoverEnd
    }
  };
}
