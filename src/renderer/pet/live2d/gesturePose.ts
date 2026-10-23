import type { PetReactionName } from "../../../shared/actions.js";

// Eased keyframes keep both position and velocity continuous at each pause.
function track(time: number, points: Array<[number, number]>): number {
  for (let i = 1; i < points.length; i++) {
    if (time <= points[i][0]) {
      const [start, from] = points[i - 1], [end, to] = points[i];
      const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
      return from + (to - from) * t * t * (3 - 2 * t);
    }
  }
  return points.at(-1)![1];
}

export function gesturePose(action: PetReactionName, progress: number): Record<string, number> {
  const t = Math.max(0, Math.min(1, progress));
  const hold = track(t, [[0, 0], [0.2, 1], [0.65, 1], [1, 0]]);
  const pose: Record<string, number> = { ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0,
    ParamBodyAngleX: 0, ParamBodyAngleY: 0, ParamBodyAngleZ: 0,
    ParamEyeBallX: 0, ParamEyeBallY: 0, ParamEyeLOpen: 1, ParamEyeROpen: 1,
    ParamEyeLSmile: 0, ParamEyeRSmile: 0, ParamMouthForm: 0, ParamMouthOpenY: 0 };
  if (action === "Nod") {
    pose.ParamAngleY = track(t, [[0, 0], [0.13, 3], [0.32, -10], [0.48, 2], [0.65, -6.5], [0.82, 1], [1, 0]]);
    pose.ParamEyeBallY = pose.ParamAngleY / 65;
    pose.ParamMouthForm = 0.35 * hold;
  } else if (action === "ShakeHead") {
    pose.ParamAngleX = track(t, [[0, 0], [0.2, -12], [0.42, 11], [0.64, -8], [0.82, 4], [1, 0]]);
    pose.ParamAngleZ = -pose.ParamAngleX * 0.1;
    pose.ParamEyeBallX = hold * track(Math.min(1, t + 0.035), [[0, 0], [0.2, -0.22], [0.42, 0.22], [0.64, -0.15], [0.82, 0.08], [1, 0]]);
  } else if (action === "Wink") {
    const wink = track(t, [[0, 0], [0.22, 0], [0.33, 1], [0.55, 1], [0.73, 0], [1, 0]]);
    pose.ParamEyeROpen = 1 - wink * 0.98;
    pose.ParamEyeRSmile = wink * 0.8;
    pose.ParamAngleZ = hold * 5;
    pose.ParamMouthForm = hold * 0.65;
  } else if (action === "Shy") {
    pose.ParamAngleX = track(t, [[0, 0], [0.28, -6], [0.55, -6], [0.75, -3], [1, 0]]);
    pose.ParamAngleY = hold * -5;
    pose.ParamAngleZ = hold * 3;
    pose.ParamEyeBallX = hold * 0.22;
    pose.ParamEyeBallY = hold * -0.2;
    pose.ParamEyeLOpen = pose.ParamEyeROpen = 1 - hold * 0.25;
    pose.ParamMouthForm = hold * 0.42;
  } else if (action === "Yawn") {
    const yawn = track(t, [[0, 0], [0.18, 0.2], [0.4, 1], [0.58, 1], [0.8, 0.15], [1, 0]]);
    pose.ParamAngleY = yawn * 5;
    pose.ParamAngleZ = yawn * -1.8;
    pose.ParamEyeLOpen = pose.ParamEyeROpen = 1 - yawn * 0.94;
    pose.ParamMouthOpenY = yawn * 0.65;
    pose.ParamMouthForm = yawn * -0.25;
  } else {
    const envelope = Math.sin(Math.PI * t) ** 2;
    const sway = Math.sin(t * Math.PI * 4) * envelope;
    pose.ParamBodyAngleZ = sway * 2.8;
    pose.ParamAngleZ = Math.sin(t * Math.PI * 4 - 0.35) * envelope * 4;
    pose.ParamAngleX = sway * 2;
    pose.ParamEyeLOpen = pose.ParamEyeROpen = 1 - hold * 0.15;
    pose.ParamMouthForm = hold * 0.6;
  }
  return pose;
}
