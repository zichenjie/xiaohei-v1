import { isPetReactionName, type PetReactionName } from "../../../shared/actions.js";

export type TouchTarget = "head" | "cheekLeft" | "cheekRight" | "body" | "none";
export type SoftAction = PetReactionName | "HeadTouch" | "CheekLeft" | "CheekRight" | "BodyTouch" | "Stroke" | "Observe" | "Relax" | "Drowsy" | "Invite" | "Settle";
export type AutonomousActivity = PetReactionName | "Observe" | "Relax" | "Drowsy";
export function isAutonomousActivity(value: unknown): value is AutonomousActivity {
  return typeof value === "string" && (isPetReactionName(value) || ["Observe", "Relax", "Drowsy"].includes(value));
}
export interface CompanionState { energy: number; mood: number; updatedAt: number; }
export const COMPANION_STORAGE_KEY = "xiaohei.companion.v1";
const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function restoreCompanion(value: unknown, now = Date.now()): CompanionState {
  const saved = value as Partial<CompanionState> | null;
  if (!saved || ![saved.energy, saved.mood, saved.updatedAt].every((n) => typeof n === "number" && Number.isFinite(n))) {
    return { energy: 75, mood: 60, updatedAt: now };
  }
  const awayMinutes = Math.min(120, Math.max(0, now - saved.updatedAt!) / 60000);
  return { energy: clamp(saved.energy! + awayMinutes * 2), mood: clamp(saved.mood!), updatedAt: now };
}

export function advanceCompanion(state: CompanionState, seconds: number, activity: "awake" | "sleeping" | "stroking", now = Date.now()): CompanionState {
  const dt = Math.max(0, Math.min(10, seconds));
  const energyRate = activity === "sleeping" ? 5 / 60 : activity === "stroking" ? 0.08 : -0.6 / 60;
  const mood = activity === "stroking" ? state.mood + dt * 1.6 : 55 + (state.mood - 55) * Math.exp(-dt / 900);
  return { energy: clamp(state.energy + dt * energyRate), mood: clamp(mood), updatedAt: now };
}

export function rewardInteraction(state: CompanionState, action: string, userInitiated = true): CompanionState {
  const cost = action === "Bounce" ? 2 : action === "Move" ? 1.5 : ["Happy", "Sway"].includes(action) ? 0.6 : 0;
  const reward = ["HeadTouch", "CheekLeft", "CheekRight", "BodyTouch", "Pat", "Happy", "Nod", "Wink", "Shy", "Sway"].includes(action) ? 1.2 : 0;
  return { ...state, energy: clamp(state.energy - cost), mood: clamp(state.mood + (userInitiated ? reward : 0)) };
}

export function chooseAutonomousActivity(state: Pick<CompanionState, "energy" | "mood">, recent: readonly AutonomousActivity[], random = Math.random()): AutonomousActivity {
  // Repeated entries are weights. Fatigue takes priority over a cheerful mood.
  const pool: AutonomousActivity[] = state.energy <= 35 ? ["Yawn", "Yawn", "Yawn", "Relax", "Relax", "Drowsy"]
    : state.energy < 60 ? ["Nod", "Shy", "Observe", "Observe", "Relax", "Relax", "Yawn"]
    : state.mood < 45 ? ["Shy", "Shy", "Shy", "ShakeHead", "Relax", "Relax", "Relax", "Observe", "Nod"]
    : state.mood >= 75 ? ["Wink", "Wink", "Wink", "Sway", "Sway", "Nod", "Nod", "Shy", "Observe", "Relax"]
    : ["Nod", "Nod", "Wink", "Shy", "ShakeHead", "Observe", "Observe", "Relax", "Relax"];
  const fresh = pool.filter((action) => !recent.slice(-2).includes(action));
  const choices = fresh.length ? fresh : pool.filter((action) => action !== recent.at(-1));
  const index = Math.floor(Math.max(0, Math.min(0.999999, Number.isFinite(random) ? random : 0)) * choices.length);
  return choices[index];
}

export function chooseIdle(state: CompanionState, previous: SoftAction | null, random = Math.random()): SoftAction {
  const candidates: SoftAction[] = state.energy < 30 ? ["Drowsy", "Relax", "Drowsy"]
    : state.mood > 70 ? ["Relax", "Observe", "Relax"] : ["Observe", "Relax"];
  const choices = candidates.filter((action) => action !== previous);
  return choices[Math.min(choices.length - 1, Math.floor(Math.max(0, random) * choices.length))];
}

export function isSoftAction(action: string): action is SoftAction {
  return isPetReactionName(action) || ["HeadTouch", "CheekLeft", "CheekRight", "BodyTouch", "Stroke", "Observe", "Relax", "Drowsy", "Invite", "Settle"].includes(action);
}

export function classifyHeadPoint(x: number, y: number): TouchTarget {
  if (x * x + y * y > 1) return "none";
  // Coordinates are normalized in the rendered face bounds, positive Y downward.
  if (y > 0.05 && y < 0.75 && Math.abs(x) > 0.25) return x < 0 ? "cheekLeft" : "cheekRight";
  return "head";
}
