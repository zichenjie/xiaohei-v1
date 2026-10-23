import { useEffect, useRef, useState } from "react";
import { PET_ACTIONS, EXTRA_ACTIONS, type PetActionName } from "../../shared/actions.js";
import type { WalkDirection } from "../../shared/walk.js";

const SYMBOLS: Record<PetActionName, string> = {
  Idle: "◌", Bounce: "↟", Sleep: "☾", Greet: "✦",
  Curious: "?", Happy: "♥", Pat: "✿", Move: "↔", hair: "◐",
  Nod: "✓", ShakeHead: "～", Wink: "✧", Shy: "♡", Yawn: "☁", Sway: "♪"
};
const COMMON_ACTIONS = PET_ACTIONS.filter((action) => action.kind !== "reaction");

function point(radius: number, angle: number) {
  const radians = angle * Math.PI / 180;
  return { x: 300 + radius * Math.cos(radians), y: 310 - radius * Math.sin(radians) };
}

function sector(index: number, count: number): string {
  const step = 180 / count;
  const from = 179 - index * step;
  const to = 181 - (index + 1) * step;
  const a = point(275, from);
  const b = point(275, to);
  const c = point(175, to);
  const d = point(175, from);
  return `M${a.x},${a.y} A275,275 0 0 1 ${b.x},${b.y} L${c.x},${c.y} A175,175 0 0 0 ${d.x},${d.y} Z`;
}

export function ActionsApp() {
  const [hovered, setHovered] = useState<PetActionName | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [locked, setLocked] = useState(false);
  const [choosingDirection, setChoosingDirection] = useState(false);
  const [page, setPage] = useState<"common" | "extra">("common");
  const actions = page === "common" ? COMMON_ACTIONS : EXTRA_ACTIONS;

  function changePage(next: "common" | "extra") {
    setPage(next);
    setHovered(null);
    setChoosingDirection(false);
    setError(null);
  }

  useEffect(() => {
    let active = true;
    void window.xiaohei.config.get().then((config) => { if (active) setLocked(config.window.locked); });
    const unsubscribe = window.xiaohei.config.onChanged((config) => setLocked(config.window.locked));
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (choosingDirection) setChoosingDirection(false);
        else void window.xiaohei.pet.closeActions();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [choosingDirection]);

  async function trigger(action: PetActionName, direction?: WalkDirection) {
    if (busy) return;
    setError(null);
    if (action === "Move" && !direction) {
      setChoosingDirection(true);
      return;
    }
    setBusy(true);
    try {
      await window.xiaohei.pet.triggerAction(action, direction);
      setChoosingDirection(false);
    } catch (error) {
      setError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "动作播放失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="action-fan" aria-label="动作菜单" onMouseLeave={() => setHovered(null)}>
      <svg className="fan-background" viewBox="0 0 600 360" aria-hidden="true">
        {actions.map((action, index) => (
          <path key={action.name} d={sector(index, actions.length)} className={hovered === action.name ? "selected" : ""} />
        ))}
      </svg>
      <div role="group" aria-label="选择动作">
        {actions.map((action, index) => {
          const position = point(225, 180 - (index + 0.5) * 180 / actions.length);
          return (
            <button
              key={action.name} ref={(node) => { buttons.current[index] = node; }}
              type="button" className="fan-action" disabled={busy || (action.name === "Move" && locked)}
              title={action.name === "Move" && locked ? "请先解除位置锁定" : undefined}
              style={{ left: `${position.x / 6}%`, top: `${position.y / 3.6}%` }}
              onMouseEnter={() => setHovered(action.name)} onFocus={() => setHovered(action.name)}
              onClick={() => void trigger(action.name)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  buttons.current[(index + (event.key === "ArrowRight" ? 1 : -1) + actions.length) % actions.length]?.focus();
                }
              }}
            >
              <span className="action-symbol" aria-hidden="true">{SYMBOLS[action.name]}</span>
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
      <div className="fan-pages" role="group" aria-label="动作分类">
        <button type="button" aria-pressed={page === "common"} disabled={busy} onClick={() => changePage("common")}>常用动作</button>
        <button type="button" aria-pressed={page === "extra"} disabled={busy} onClick={() => changePage("extra")}>小表情</button>
      </div>
      <div className="fan-caption">
        <span className="fan-title">{choosingDirection ? "往哪边走？" : hovered ? PET_ACTIONS.find((action) => action.name === hovered)?.label : "想做些什么？"}</span>
        {choosingDirection ? (
          <div className="walk-directions" role="group" aria-label="移动方向">
            <button type="button" disabled={busy || locked} onClick={() => void trigger("Move", "left")}>← 向左走</button>
            <button type="button" disabled={busy || locked} onClick={() => void trigger("Move", "right")}>向右走 →</button>
          </div>
        ) : <span className="fan-hint">选择一个动作</span>}
        <button type="button" className="fan-close" aria-label="收起动作菜单" onClick={() => { setChoosingDirection(false); setError(null); void window.xiaohei.pet.closeActions(); }}>×</button>
      </div>
      {error ? <p className="fan-error" role="alert">{error}</p> : null}
    </main>
  );
}
