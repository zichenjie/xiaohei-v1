import { useEffect, useRef, useState } from "react";
import { PET_ACTIONS } from "../../shared/actions.js";
import type { PetActionName } from "../../shared/ipc.js";
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

  async function triggerAction(action: PetActionName) {
    try {
      setError(null);
      await window.xiaohei.pet.triggerAction(action);
    } catch (err) {
      setError(errorMessage(err));
    }
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
        <h2>动作</h2>
        <div className="action-grid" role="group" aria-label="动作触发">
          {PET_ACTIONS.map((item) => (
            <button key={item.name} type="button" onClick={() => void triggerAction(item.name)}>
              {item.label}
            </button>
          ))}
        </div>
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
