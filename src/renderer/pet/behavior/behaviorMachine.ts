import type { BehaviorMode } from "../../../shared/types.js";
import type { SoftAction, TouchTarget } from "./companion.js";

export type BehaviorState = "idle" | "hover" | "clicked" | "dragging" | "stroking" | "cooldown" | "sleeping" | "error";
export type Live2DAction =
  | SoftAction
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
  | { type: "action"; action: Live2DAction }
  | { type: "hover:start" }
  | { type: "hover:end" }
  | { type: "click"; target?: TouchTarget }
  | { type: "double:click"; target?: TouchTarget }
  | { type: "sleep:started" }
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
  send(event: BehaviorEvent): boolean;
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

    send(event: BehaviorEvent): boolean {
      nextAction = "none";
      if (event.type === "action") {
        state = event.action === "Sleep" ? "sleeping" : ["Idle", "hair"].includes(event.action) ? "idle" : "clicked";
        nextAction = event.action;
        return true;
      }
      if (event.type === "recover") {
        enterIdle();
        return true;
      }
      if (state === "error") {
        nextAction = "none";
        return false;
      }

      if (event.type === "sleep:started") {
        state = "sleeping";
        return true;
      }
      if (state === "sleeping" && event.type !== "error") {
        if ((event.type === "click" || event.type === "double:click") && ["head", "cheekLeft", "cheekRight"].includes(event.target ?? "")) {
          state = "clicked";
          nextAction = "Wake";
          return true;
        }
        return false;
      }

      if (state === "stroking" && event.type !== "hold:end" && event.type !== "error") return false;

      const directTouch = (event.type === "click" || event.type === "double:click") && event.target && event.target !== "none";

      if (state === "dragging" && event.type !== "drag:end" && event.type !== "error") {
        nextAction = "none";
        return false;
      }

      if (state === "cooldown" && event.type !== "cooldown:finished" && event.type !== "hold:start" && event.type !== "drag:start" && !directTouch && event.type !== "error") {
        nextAction = "none";
        return false;
      }

      if (
        state === "clicked" &&
        !directTouch &&
        event.type !== "motion:finished" &&
        event.type !== "drag:start" &&
        event.type !== "hold:start" &&
        event.type !== "hold:end" &&
        event.type !== "error"
      ) {
        return false;
      }

      switch (event.type) {
        case "hover:start":
          state = "hover";
          nextAction = "none";
          break;

        case "hover:end":
          state = "idle";
          break;

        case "click":
          if (event.target === "none") return false;
          state = "clicked";
          nextAction = event.target === "head" ? "HeadTouch" : event.target === "cheekLeft" ? "CheekLeft"
            : event.target === "cheekRight" ? "CheekRight" : event.target === "body" ? "BodyTouch" : "Tap";
          break;

        case "double:click":
          if (event.target === "none") return false;
          state = "clicked";
          nextAction = "Happy";
          break;

        case "hold:start":
          state = "stroking";
          nextAction = "Stroke";
          break;

        case "hold:end":
          enterCooldown();
          nextAction = "Idle";
          break;

        case "drag:start":
          state = "dragging";
          nextAction = "none";
          break;

        case "drag:end":
          enterCooldown();
          break;

        case "idle:tick":
          if (state === "idle" || state === "hover") {
            state = "idle";
            nextAction = "IdleVariant";
          }
          break;

        case "motion:finished":
          if (state === "clicked") {
            enterCooldown();
          }
          break;

        case "cooldown:finished":
          enterIdle();
          break;

        case "error":
          state = "error";
          nextAction = "none";
          break;
      }
      return true;
    },

    snapshot(): BehaviorSnapshot {
      return { mode, state, nextAction };
    }
  };
}
