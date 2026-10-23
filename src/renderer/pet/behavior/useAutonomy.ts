import { useEffect, useRef, useState } from "react";
import type { AppConfig } from "../../../shared/types.js";
import type { CompanionBubble, CompanionContext } from "../../../shared/companion.js";
import type { CompanionState } from "./companion.js";
import type { Live2DAction } from "./behaviorMachine.js";
import { AUTONOMY_STORAGE_KEY, createAutonomy, type AutonomyContext } from "./autonomy.js";

interface Options {
  config: AppConfig | null;
  ready: boolean;
  state: string;
  visualAction: Live2DAction;
  companion: CompanionState;
  anchor(): CompanionBubble["anchor"] | null;
  act(action: Live2DAction): void;
}

export function useAutonomy(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [engine] = useState(() => {
    let saved: unknown;
    try { saved = JSON.parse(localStorage.getItem(AUTONOMY_STORAGE_KEY) ?? "null"); } catch { /* First run. */ }
    return createAutonomy(saved);
  });
  const [phase, setPhase] = useState("quiet");
  const alive = useRef(true);
  const revision = useRef(0);
  const previousQuietUntil = useRef<number | null>(null);
  const context = (system: CompanionContext): AutonomyContext => {
    const o = latest.current;
    return {
      now: Date.now(), energy: o.companion.energy, mood: o.companion.mood,
      initiative: o.config?.pet.initiative ?? "quiet", autoRest: o.config?.pet.autoRest ?? false,
      quietUntil: o.config?.pet.quietUntil ?? 0, idleSeconds: system.idleSeconds,
      blocked: system.blocked || !o.ready || !o.config?.window.visible || !!o.config?.window.clickThrough
        || ["sleeping", "error", "dragging", "stroking"].includes(o.state),
      available: (o.state === "idle" || o.state === "hover") && o.visualAction === "Idle"
    };
  };
  const save = () => { try { localStorage.setItem(AUTONOMY_STORAGE_KEY, JSON.stringify(engine.memory)); } catch { /* Storage is optional. */ } };
  const hide = () => { void window.xiaohei.companion.setBubble(null).catch(() => {}); };
  const show = async (kind: CompanionBubble["kind"], id: string, expiresAt: number) => {
    const anchor = latest.current.anchor();
    return anchor ? window.xiaohei.companion.setBubble({ id, kind, expiresAt, anchor }) : false;
  };
  const feedback = (kind: "thanks" | "busy") => {
    void show(kind, `${kind}-${Date.now()}`, Date.now() + 3000).catch(() => {});
  };
  const interact = (response: "attention" | "manual" | "busy" = "attention") => {
    revision.current++;
    const acknowledged = engine.interact(Date.now(), latest.current.config?.pet.initiative ?? "balanced", response);
    hide();
    setPhase("quiet");
    save();
    if (acknowledged) feedback("thanks");
  };

  useEffect(() => {
    const next = options.config?.pet.quietUntil;
    if (next === undefined) return;
    const previous = previousQuietUntil.current;
    previousQuietUntil.current = next;
    // Explicitly resuming means the user is ready for normal companionship.
    // Keep the hourly cap, but replace the old busy deadline with a fresh,
    // ordinary invitation interval. Initial config hydration is not input.
    if (previous !== null && previous > Date.now() && next === 0) interact("attention");
  }, [options.config?.pet.quietUntil, engine]);

  useEffect(() => {
    alive.current = true;
    let pending = false;
    let ticks = 0;
    const tick = async () => {
      if (pending) return;
      pending = true;
      try {
        const version = revision.current;
        const system = await window.xiaohei.companion.context();
        if (!alive.current || version !== revision.current) return;
        const wasResting = engine.resting;
        const wasActivity = engine.activity;
        const decision = engine.step(context(system));
        if (decision === "invite") {
          const invitation = engine.invitation!;
          setPhase("inviting");
          latest.current.act("Invite");
          const displayed = await show(invitation.kind, invitation.id, invitation.expiresAt);
          if (!displayed && engine.invitation?.id === invitation.id) { engine.cancel(); setPhase("quiet"); }
        } else if (decision === "rest") {
          setPhase("resting");
          latest.current.act("Settle");
        } else if (decision === "activity") {
          setPhase("acting");
          latest.current.act(engine.activity!);
        } else if (decision === "expired" || decision === "cancel") {
          hide(); setPhase("quiet");
          if (wasResting) latest.current.act("Idle");
          else if (wasActivity && latest.current.visualAction === wasActivity && latest.current.state === "clicked") latest.current.act("Idle");
          else if (decision === "expired" && context(system).available) latest.current.act("Relax");
        }
        if (decision || ++ticks % 15 === 0) save();
      } catch {
        const wasResting = engine.resting;
        engine.cancel(); hide();
        if (alive.current) { setPhase("quiet"); if (wasResting) latest.current.act("Idle"); }
      } finally { pending = false; }
    };
    const timer = window.setInterval(() => void tick(), 1000);
    const unsubscribe = window.xiaohei.companion.onReply((reply) => {
      const invitation = engine.invitation;
      if (!invitation || invitation.id !== reply.id || Date.now() >= invitation.expiresAt) return;
      const kind = invitation.kind;
      interact(reply.response === "busy" ? "busy" : "attention");
      if (reply.response === "busy") {
        feedback("busy");
        latest.current.act("Relax");
        void window.xiaohei.config.update({ pet: { quietUntil: Date.now() + 3600000 } }).catch(() => {});
      } else {
        latest.current.act(kind === "touch" ? "Pat" : "Happy");
      }
    });
    window.addEventListener("pagehide", save);
    return () => {
      alive.current = false;
      window.clearInterval(timer); unsubscribe(); window.removeEventListener("pagehide", save);
      engine.cancel(); hide(); save();
    };
  }, [engine]);

  return {
    phase,
    interact,
    get activity() { return engine.activity; },
    canPlayIdle() {
      return !engine.invitation && !engine.resting && !engine.activity && latest.current.visualAction === "Idle";
    },
    finishActivity() {
      if (engine.finishActivity(Date.now())) { setPhase("quiet"); save(); }
    },
    finishRest() {
      if (!engine.resting) return false;
      const version = revision.current;
      void window.xiaohei.companion.context().then((system) => {
        if (!alive.current || version !== revision.current || !engine.resting) return;
        const sleep = engine.finishRest(context(system));
        setPhase("quiet");
        latest.current.act(sleep ? "Sleep" : "Idle");
        save();
      }).catch(() => {
        if (!alive.current || version !== revision.current || !engine.resting) return;
        engine.cancel(); setPhase("quiet"); latest.current.act("Idle");
      });
      return true;
    }
  };
}
