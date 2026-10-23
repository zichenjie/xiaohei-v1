import { describe, expect, it } from "vitest";
import { IPC_CHANNELS, type ConfigPatch } from "../../src/shared/ipc.js";

type Assert<T extends true> = T;
type HasSystemPatch = "system" extends keyof ConfigPatch ? true : false;

type _ConfigPatchExcludesSystem = Assert<HasSystemPatch extends false ? true : false>;

describe("IPC channels", () => {
  it("uses stable explicit channel names", () => {
    expect(IPC_CHANNELS.configGet).toBe("config:get");
    expect(IPC_CHANNELS.configUpdate).toBe("config:update");
    expect(IPC_CHANNELS.configChanged).toBe("config:changed");
    expect(IPC_CHANNELS.petPositionUpdate).toBe("pet:position:update");
    expect(IPC_CHANNELS.petVisibilitySet).toBe("pet:visibility:set");
    expect(IPC_CHANNELS.petClickThroughSet).toBe("pet:click-through:set");
    expect(IPC_CHANNELS.petActionsOpen).toBe("pet:actions:open");
    expect(IPC_CHANNELS.petActionsClose).toBe("pet:actions:close");
    expect(IPC_CHANNELS.appAutoLaunchSet).toBe("app:auto-launch:set");
    expect(IPC_CHANNELS.settingsOpen).toBe("settings:open");
    expect(IPC_CHANNELS.appQuit).toBe("app:quit");
  });

  it("keeps side-effectful system settings out of generic config patches", () => {
    const patch = {
      window: { visible: true },
      pet: { behaviorMode: "quiet" },
      ai: { enabled: false, provider: "none", model: "" }
    } satisfies ConfigPatch;

    expect("system" in patch).toBe(false);
  });
});
