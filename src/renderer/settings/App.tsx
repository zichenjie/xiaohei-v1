import { useEffect, useRef, useState } from "react";
import type { AppConfig, BehaviorMode } from "../../shared/types.js";
import "./styles.css";

type WindowSetting = keyof Pick<AppConfig["window"], "scale" | "alwaysOnTop" | "locked">;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "设置更新失败";
}

export function SettingsApp() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 10000); return () => window.clearInterval(timer); }, []);

  useEffect(() => {
    mountedRef.current = true;
    const requestId = ++requestIdRef.current;

    window.xiaohei.config
      .get()
      .then((nextConfig) => {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setConfig(nextConfig);
        }
      })
      .catch((err: unknown) => {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setError(errorMessage(err));
        }
      });

    const unsubscribe = window.xiaohei.config.onChanged((nextConfig) => {
      requestIdRef.current++;
      if (mountedRef.current) {
        setError(null);
        setConfig(nextConfig);
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  async function applyUpdate(update: Promise<AppConfig>) {
    const requestId = ++requestIdRef.current;
    try {
      setError(null);
      const nextConfig = await update;
      if (mountedRef.current && requestId === requestIdRef.current) {
        setConfig(nextConfig);
      }
    } catch (err) {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setError(errorMessage(err));
      }
    }
  }

  async function updateMode(behaviorMode: BehaviorMode) {
    await applyUpdate(window.xiaohei.config.update({ pet: { behaviorMode } }));
  }

  async function updateWindow(key: WindowSetting, value: boolean | number) {
    await applyUpdate(window.xiaohei.config.update({ window: { [key]: value } }));
  }

  async function updateClickThrough(enabled: boolean) {
    await applyUpdate(window.xiaohei.pet.setClickThrough(enabled));
  }

  async function updateAutoLaunch(enabled: boolean) {
    await applyUpdate(window.xiaohei.app.setAutoLaunch(enabled));
  }

  if (!config) {
    return (
      <main className="settings">
        <p className={error ? "error" : "loading"}>{error ?? "加载中"}</p>
      </main>
    );
  }

  return (
    <main className="settings">
      <header className="settings-header">
        <h1>罗小黑桌宠设置</h1>
        {error ? <p className="error">{error}</p> : null}
      </header>

      <section>
        <h2>行为模式</h2>
        <div className="segmented" role="group" aria-label="行为模式">
          <button
            type="button"
            className={config.pet.behaviorMode === "quiet" ? "active" : ""}
            aria-pressed={config.pet.behaviorMode === "quiet"}
            onClick={() => void updateMode("quiet")}
          >
            安静
          </button>
          <button
            type="button"
            className={config.pet.behaviorMode === "active" ? "active" : ""}
            aria-pressed={config.pet.behaviorMode === "active"}
            onClick={() => void updateMode("active")}
          >
            活泼
          </button>
        </div>
        <label>
          <input
            type="checkbox"
            checked={config.pet.followMouse}
            onChange={(event) => void applyUpdate(window.xiaohei.config.update({ pet: { followMouse: event.target.checked } }))}
          />
          鼠标跟随
        </label>
      </section>

      <section>
        <h2>主动陪伴</h2>
        <div className="segmented" role="group" aria-label="主动程度">
          {([ ["quiet", "安静"], ["balanced", "适中"], ["active", "活泼"] ] as const).map(([value, label]) =>
            <button key={value} aria-pressed={config.pet.initiative === value} className={config.pet.initiative === value ? "active" : ""}
              onClick={() => void applyUpdate(window.xiaohei.config.update({ pet: { initiative: value } }))}>{label}</button>)}
        </div>
        <p className="setting-hint">按心情和精力偶尔做小表情：适中约隔 5–8 分钟，活泼约隔 4–7 分钟，每小时最多 6 次。安静时暂停主动表情和邀请。</p>
        <p className="setting-hint">邀请你互动的气泡：适中约 10–15 分钟、活泼约 8–12 分钟才可能出现；每小时最多两次，未回应会延长间隔。</p>
        <label><input type="checkbox" checked={config.pet.autoRest}
          onChange={(event) => void applyUpdate(window.xiaohei.config.update({ pet: { autoRest: event.target.checked } }))} />累了自己休息</label>
        <p className="setting-hint">至少 20 分钟没有互动、精力较低时入睡，点击头部唤醒。</p>
        <button onClick={() => void applyUpdate(window.xiaohei.config.update({ pet: { quietUntil: config.pet.quietUntil > now ? 0 : Date.now() + 3600000 } }))}>
          {config.pet.quietUntil > now ? "恢复主动邀请" : "安静一小时"}
        </button>
        {config.pet.quietUntil > now ? <p className="setting-hint">正在安静陪伴，仍可互动，也会正常休息。</p> : null}
      </section>

      <section>
        <h2>窗口</h2>
        <label className="scale-row">
          <span>大小</span>
          <input
            type="range"
            min="0.4"
            max="2"
            step="0.1"
            value={config.window.scale}
            onChange={(event) => void updateWindow("scale", Number(event.target.value))}
          />
          <output>{Math.round(config.window.scale * 100)}%</output>
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.window.alwaysOnTop}
            onChange={(event) => void updateWindow("alwaysOnTop", event.target.checked)}
          />
          始终置顶
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.window.locked}
            onChange={(event) => void updateWindow("locked", event.target.checked)}
          />
          锁定位置
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.window.clickThrough}
            onChange={(event) => void updateClickThrough(event.target.checked)}
          />
          鼠标穿透
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.system.autoLaunch}
            onChange={(event) => void updateAutoLaunch(event.target.checked)}
          />
          开机自启
        </label>
      </section>

      <section>
        <h2>模型</h2>
        <code>{config.pet.modelPath}</code>
      </section>

      <section className="disabled-section" aria-disabled="true">
        <h2>AI 预留</h2>
        <p>第一版不连接网络服务。后续可在这里配置聊天、语音和工具调用。</p>
      </section>
    </main>
  );
}
