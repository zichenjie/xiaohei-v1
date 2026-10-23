import { useEffect, useState } from "react";
import { STATUS_ACTIVITIES, energyDescription, moodDescription, type PetStatus } from "../../shared/status.js";

export function StatusApp() {
  const [status, setStatus] = useState<PetStatus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let changed = false;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void window.xiaohei.status.close();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    const unsubscribe = window.xiaohei.status.onChanged((next) => {
      changed = true;
      setStatus(next);
      setError(false);
    });
    void window.xiaohei.status.get().then((next) => {
      if (active && !changed) setStatus(next);
    }).catch(() => { if (active && !changed) setError(true); });
    return () => { active = false; unsubscribe(); window.removeEventListener("keydown", closeOnEscape); };
  }, []);

  return (
    <main className="status-card">
      <header>
        <span className="status-eyebrow">此刻的小黑</span>
        <h1>罗小黑的状态</h1>
        <p className="status-activity" aria-live="polite">{status ? STATUS_ACTIVITIES[status.activity] : error ? "暂时无法读取，请关闭后重试" : "正在读取状态…"}</p>
      </header>
      {status ? <div className="status-metrics">
        <Metric name="心情" value={status.mood} description={moodDescription(status.mood)} kind="mood" />
        <Metric name="精力" value={status.energy} description={energyDescription(status.energy)} kind="energy" />
      </div> : null}
      <p className="status-hint">摸摸头会让它开心，睡觉能恢复精力。<br />数值实时更新，关闭后不在桌面显示。</p>
      <button type="button" autoFocus onClick={() => void window.xiaohei.status.close()}>关闭</button>
    </main>
  );
}

function Metric({ name, value, description, kind }: { name: string; value: number; description: string; kind: string }) {
  return <section className={`status-metric ${kind}`} aria-label={name}>
    <div className="metric-heading"><h2>{name}</h2><span>{description}</span><output>{value.toFixed(1)}<small> / 100</small></output></div>
    <div className="metric-track" role="meter" aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(value.toFixed(1))} aria-valuetext={`${value.toFixed(1)}，${description}`}>
      <div className="metric-fill" style={{ width: `${value}%` }} />
    </div>
  </section>;
}
