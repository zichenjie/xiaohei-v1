import type { BehaviorMode } from "../../../shared/types.js";

export type BehaviorState = "idle" | "hover" | "clicked" | "dragging" | "cooldown" | "error";
export type Live2DAction =
  | "Idle"
  | "Bounce"
  | "Sleep"
  | "Wake"
  | "Move"
  | "hair"
  | "Tap"
  | "IdleVariant"
  | "Greet"
  | "Happy"
  | "Curious"
  | "Pat"
  | "DragStart"
  | "none";

export type BehaviorEvent =
  | { type: "hover:start" }
  | { type: "hover:end" }
  | { type: "click" }
  | { type: "double:click" }
  | { type: "hold:start" }
  | { type: "hold:end" }
  | { type: "drag:start" }
  | { type: "drag:end" }
  | { type: "idle:tick" }
  | { type: "motion:finished" }
  | { type: "cooldown:finished" }
  | { type: "error" }
  | { type: "recover" };

export interface BehaviorSnapshot {
  mode: BehaviorMode;
  state: BehaviorState;
  nextAction: Live2DAction;
}

export interface BehaviorMachine {
  setMode(nextMode: BehaviorMode): void;
  send(event: BehaviorEvent): void;
  snapshot(): BehaviorSnapshot;
}

export function createBehaviorMachine(mode: BehaviorMode): BehaviorMachine {
  let state: BehaviorState = "idle";
  let nextAction: Live2DAction = "Idle";

  function enterIdle(): void {
    state = "idle";
    nextAction = "Idle";
  }

  function enterCooldown(): void {
    state = "cooldown";
    nextAction = "none";
  }

  return {
    setMode(nextMode: BehaviorMode): void {
      mode = nextMode;
    },

    send(event: BehaviorEvent): void {
      if (state === "error" && event.type !== "recover") {
        nextAction = "none";
        return;
      }

      if (state === "dragging" && event.type !== "drag:end" && event.type !== "error") {
        nextAction = "none";
        return;
      }

      if (state === "cooldown" && event.type !== "cooldown:finished" && event.type !== "error") {
        nextAction = "none";
        return;
      }

      if (
        state === "clicked" &&
        event.type !== "motion:finished" &&
        event.type !== "drag:start" &&
        event.type !== "hold:start" &&
        event.type !== "hold:end" &&
        event.type !== "error"
      ) {
        return;
      }

      switch (event.type) {
        case "hover:start":
          state = "hover";
          nextAction = mode === "active" ? "Curious" : "none";
          break;

        case "hover:end":
          enterIdle();
          break;

        case "click":
          state = "clicked";
          nextAction = "Tap";
          break;

        case "double:click":
          state = "clicked";
          nextAction = "Happy";
          break;

        case "hold:start":
          state = "clicked";
          nextAction = "Pat";
          break;

        case "hold:end":
          enterCooldown();
          break;

        case "drag:start":
          state = "dragging";
          nextAction = "none";
          break;

        case "drag:end":
          enterCooldown();
          break;

        case "idle:tick":
          if (state === "idle") {
            nextAction = mode === "active" ? "IdleVariant" : "Greet";
          }
          break;

        case "motion:finished":
          if (state === "clicked") {
            enterCooldown();
          }
          break;

        case "cooldown:finished":
        case "recover":
          enterIdle();
          break;

        case "error":
          state = "error";
          nextAction = "none";
          break;
      }
    },

    snapshot(): BehaviorSnapshot {
      return { mode, state, nextAction };
    }
  };
}
