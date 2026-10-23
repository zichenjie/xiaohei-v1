import type { Initiative } from "../../../shared/types.js";
import type { InvitationKind } from "../../../shared/companion.js";
import { chooseAutonomousActivity, isAutonomousActivity, type AutonomousActivity } from "./companion.js";

export const AUTONOMY_STORAGE_KEY = "xiaohei.autonomy.v1";
export const MINUTE = 60000;
export interface AutonomyMemory {
  lastInteractionAt: number;
  nextInviteAt: number;
  nextObserveAt: number;
  misses: number;
  invitations: number[];
  lastKind: InvitationKind;
  recentActivities: AutonomousActivity[];
  activities: number[];
  nextAutonomousAt: number;
}
export interface AutonomyContext {
  now: number;
  energy: number;
  mood: number;
  initiative: Initiative;
  autoRest: boolean;
  quietUntil: number;
  blocked: boolean;
  idleSeconds: number;
  available: boolean;
}
export type AutonomousDecision = "activity" | "invite" | "rest" | "expired" | "cancel" | null;

// Only real user input resets the relationship clock. Animation completions,
// cursor movement and idle variants deliberately do not count as attention.
export function createAutonomy(saved: unknown, now = Date.now(), random = Math.random) {
  const source = saved && typeof saved === "object" ? saved as Partial<AutonomyMemory> : {};
  const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  const stamp = (n: unknown, fallback: number) => finite(n) ? Math.max(now - 7 * 86400000, Math.min(now + 60 * MINUTE, n)) : fallback;
  const jitter = () => Math.max(0, Math.min(1, random()));
  const delay = (level: Initiative) => (level === "active" ? 8 + jitter() * 4 : 10 + jitter() * 5) * MINUTE;
  const activityDelay = (level: Initiative, misses = 0) => Math.max((level === "active" ? 4 : 5) + jitter() * 3, misses * 15) * MINUTE;
  const history = (values: unknown, limit: number) => Array.isArray(values) ? values.filter((t) => finite(t) && t <= now && t > now - 60 * MINUTE).slice(-limit) : [];
  const memory: AutonomyMemory = {
    lastInteractionAt: Math.min(now, stamp(source.lastInteractionAt, now)),
    nextInviteAt: stamp(source.nextInviteAt, now + delay("balanced")),
    nextObserveAt: stamp(source.nextObserveAt, now + (5 + jitter() * 3) * MINUTE),
    misses: finite(source.misses) ? Math.max(0, Math.min(2, Math.floor(source.misses))) : 0,
    invitations: history(source.invitations, 2),
    lastKind: source.lastKind === "play" ? "play" : "touch",
    recentActivities: Array.isArray(source.recentActivities) ? source.recentActivities.filter(isAutonomousActivity).slice(-2) : [],
    activities: history(source.activities, 6),
    nextAutonomousAt: stamp(source.nextAutonomousAt, now)
  };
  // Older versions used a twenty-minute observation interval. Bring only
  // those legacy deadlines into the new cadence without discarding history.
  if (!Array.isArray(source.activities)) {
    memory.nextObserveAt = Math.max(Math.min(memory.nextObserveAt, now + activityDelay("balanced")),
      memory.misses > 0 ? now + memory.misses * 15 * MINUTE : now - 7 * 86400000);
  }
  let graceUntil = now + MINUTE;
  let previous = now;
  let invitation: { id: string; kind: InvitationKind; expiresAt: number } | null = null;
  let resting = false;
  let activity: AutonomousActivity | null = null;
  let sequence = 0;
  const cancel = () => { invitation = null; resting = false; activity = null; };
  const restAllowed = (c: AutonomyContext) => c.autoRest && c.energy <= 35 && c.now - memory.lastInteractionAt >= 20 * MINUTE;

  return {
    memory,
    get invitation() { return invitation; },
    get resting() { return resting; },
    get activity() { return activity; },
    cancel,
    interact(at: number, level: Initiative, response: "attention" | "manual" | "busy" = "attention") {
      const acknowledged = invitation !== null && response === "attention";
      cancel();
      memory.lastInteractionAt = at;
      // Repositioning/opening a menu is not an accepted invitation, but still
      // postpones automation. Explicit affection clears the ignored streak.
      if (response === "attention") memory.misses = 0;
      memory.nextInviteAt = at + Math.max(delay(level), response === "busy" ? 60 * MINUTE : memory.misses * 30 * MINUTE);
      memory.nextObserveAt = at + Math.max(activityDelay(level, memory.misses), response === "busy" ? 60 * MINUTE : 0);
      return acknowledged;
    },
    finishActivity(at: number) {
      if (!activity) return false;
      activity = null;
      memory.nextAutonomousAt = Math.max(memory.nextAutonomousAt, at + 45000);
      return true;
    },
    finishRest(c: AutonomyContext) {
      const sleep = resting && !c.blocked && c.now >= graceUntil && restAllowed(c);
      resting = false;
      return sleep;
    },
    step(c: AutonomyContext): AutonomousDecision {
      const gap = c.now - previous;
      previous = c.now;
      if (gap > 15000 || gap < 0) graceUntil = c.now + MINUTE;
      memory.invitations = memory.invitations.filter((t) => t > c.now - 60 * MINUTE && t <= c.now);
      memory.activities = memory.activities.filter((t) => t > c.now - 60 * MINUTE && t <= c.now);
      if (c.blocked || c.now < graceUntil) {
        graceUntil = Math.max(graceUntil, c.blocked ? c.now + MINUTE : 0);
        const active = invitation !== null || resting || activity !== null;
        cancel();
        return active ? "cancel" : null;
      }
      const mayInvite = c.initiative !== "quiet" && c.quietUntil <= c.now && c.idleSeconds < 180;
      if (invitation && !mayInvite) { invitation = null; return "cancel"; }
      if (activity && !mayInvite) { activity = null; return "cancel"; }
      if (resting && !c.autoRest) { resting = false; return "cancel"; }
      if (invitation) {
        if (c.now < invitation.expiresAt) return null;
        invitation = null;
        memory.misses = Math.min(2, memory.misses + 1);
        memory.nextInviteAt = c.now + memory.misses * 30 * MINUTE;
        memory.nextObserveAt = Math.max(memory.nextObserveAt, c.now + activityDelay(c.initiative, memory.misses));
        memory.nextAutonomousAt = c.now + 45000;
        return "expired";
      }
      if (resting || activity || !c.available) return null;
      if (restAllowed(c)) { resting = true; return "rest"; }
      if (c.now < memory.nextAutonomousAt) return null;
      if (mayInvite && c.energy > 40 && c.now >= memory.nextInviteAt && memory.invitations.length < 2) {
        const kind: InvitationKind = c.mood < 55 || memory.lastKind === "play" ? "touch" : "play";
        invitation = { id: `${c.now}-${++sequence}`, kind, expiresAt: c.now + 8000 };
        // Reserve a quiet interval immediately, including across a restart or
        // a menu/lock cancellation while the invitation is being displayed.
        memory.nextInviteAt = c.now + 30 * MINUTE;
        memory.lastKind = kind;
        memory.invitations.push(c.now);
        memory.nextObserveAt = Math.max(memory.nextObserveAt, c.now + activityDelay(c.initiative, memory.misses));
        memory.nextAutonomousAt = c.now + 45000;
        return "invite";
      }
      if (mayInvite && c.now >= memory.nextObserveAt && c.now - memory.lastInteractionAt >= 4 * MINUTE && memory.activities.length < 6) {
        activity = chooseAutonomousActivity(c, memory.recentActivities, jitter());
        memory.recentActivities = [...memory.recentActivities, activity].slice(-2);
        memory.activities.push(c.now);
        // Keep the existing storage key/field so older schedules migrate safely.
        memory.nextObserveAt = c.now + activityDelay(c.initiative, memory.misses);
        memory.nextAutonomousAt = c.now + 45000;
        return "activity";
      }
      return null;
    }
  };
}
