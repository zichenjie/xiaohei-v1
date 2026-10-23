import type { CompanionState, SoftAction } from "../behavior/companion.js";
import { isPetReactionName } from "../../../shared/actions.js";
import { gesturePose } from "./gesturePose.js";

export const SOFT_DURATION: Record<SoftAction, number> = {
  HeadTouch: 1.35, CheekLeft: 1.25, CheekRight: 1.25, BodyTouch: 1.4,
  Stroke: Infinity, Observe: 2.8, Relax: 2.5, Drowsy: 3.2, Invite: 2.8, Settle: 4,
  Nod: 2.6, ShakeHead: 3, Wink: 2.4, Shy: 3.4, Yawn: 4, Sway: 4.2
};
export function softDuration(action: SoftAction, state: CompanionState): number {
  return SOFT_DURATION[action] * (isPetReactionName(action) ? 1 : 1 + Math.max(0, 40 - state.energy) / 150);
}
export const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
export const approach = (value: number, target: number, dt: number, time: number) => {
  const next = value + (target - value) * (1 - Math.exp(-Math.max(0, dt) / time));
  return Math.abs(next - target) < 0.0001 ? target : next;
};

export function softPose(action: SoftAction, elapsed: number, state: CompanionState, stroke: number): Record<string, number> {
  const duration = softDuration(action, state);
  if (isPetReactionName(action)) return gesturePose(action, elapsed / duration);
  const weight = smooth(elapsed / 0.4) * (action === "Settle" ? 1 : 1 - smooth((elapsed - duration + 0.5) / 0.5));
  const smile = 0.25 + state.mood / 250;
  const pose: Record<string, number> = {};
  if (action === "Stroke") {
    const comfort = smooth(elapsed / 1.2);
    Object.assign(pose, { ParamAngleZ: stroke * 5, ParamAngleX: stroke * 3, ParamAngleY: 2,
      ParamEyeLOpen: 1 - comfort * 0.88, ParamEyeROpen: 1 - comfort * 0.88,
      ParamEyeLSmile: comfort * 0.8, ParamEyeRSmile: comfort * 0.8, ParamMouthForm: smile * comfort });
  } else if (action === "HeadTouch") {
    Object.assign(pose, { ParamAngleY: 3, ParamAngleZ: 3.5, ParamEyeLOpen: 0.75, ParamEyeROpen: 0.75, ParamMouthForm: smile });
  } else if (action === "CheekLeft" || action === "CheekRight") {
    const sign = action === "CheekLeft" ? -1 : 1;
    Object.assign(pose, { ParamAngleX: -sign * 6, ParamAngleZ: -sign * 4,
      ParamEyeLOpen: sign < 0 ? 0.35 : 0.8, ParamEyeROpen: sign > 0 ? 0.35 : 0.8, ParamMouthForm: smile * 0.7 });
  } else if (action === "BodyTouch") {
    Object.assign(pose, { ParamAngleY: -3.5, ParamEyeBallY: -0.35, ParamBrowLY: 0.25, ParamBrowRY: 0.25, ParamMouthOpenY: 0.12 });
  } else if (action === "Invite") {
    Object.assign(pose, { ParamAngleY: 2.5, ParamAngleZ: 2.5, ParamEyeBallY: 0.12,
      ParamMouthForm: smile * 0.7, ParamEyeLOpen: 0.95, ParamEyeROpen: 0.95 });
  } else if (action === "Settle") {
    const tired = smooth(elapsed / duration);
    Object.assign(pose, { ParamAngleY: -3 * tired, ParamAngleZ: 1.2 * Math.sin(Math.PI * tired),
      ParamEyeLOpen: 1 - tired * 0.98, ParamEyeROpen: 1 - tired * 0.98, ParamMouthOpenY: 0.16 * Math.sin(Math.PI * tired) ** 2 });
  } else if (action === "Observe") {
    const look = Math.sin(elapsed / duration * Math.PI * 2);
    Object.assign(pose, { ParamEyeBallX: look * 0.3, ParamAngleX: look * 3.5, ParamAngleZ: look * -1.2 });
  } else if (action === "Relax") {
    Object.assign(pose, { ParamEyeLOpen: 0.75, ParamEyeROpen: 0.75, ParamMouthForm: smile * 0.5, ParamAngleZ: 1.3 });
  } else {
    Object.assign(pose, { ParamEyeLOpen: 0.45, ParamEyeROpen: 0.45, ParamAngleY: -2.5, ParamMouthOpenY: 0.22 * Math.sin(Math.PI * elapsed / duration) ** 2 });
  }
  for (const id of Object.keys(pose)) {
    const baseline = id === "ParamEyeLOpen" || id === "ParamEyeROpen" ? 1 : 0;
    pose[id] = baseline + (pose[id] - baseline) * weight;
  }
  return pose;
}
