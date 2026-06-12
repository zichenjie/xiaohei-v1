import type { XiaoheiBridge } from "../shared/ipc.js";

declare global {
  interface Window {
    xiaohei: XiaoheiBridge;
  }
}

export {};
