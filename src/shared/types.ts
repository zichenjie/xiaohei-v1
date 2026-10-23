export type BehaviorMode = "quiet" | "active";
export type Initiative = "quiet" | "balanced" | "active";

export interface WindowConfig {
  x: number | null;
  y: number | null;
  scale: number;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  locked: boolean;
  visible: boolean;
}

export interface PetConfig {
  behaviorMode: BehaviorMode;
  modelPath: string;
  followMouse: boolean;
  initiative: Initiative;
  autoRest: boolean;
  quietUntil: number;
}

export interface SystemConfig {
  autoLaunch: boolean;
}

export interface AiConfig {
  enabled: false;
  provider: "none";
  model: "";
}

export interface AppConfig {
  window: WindowConfig;
  pet: PetConfig;
  system: SystemConfig;
  ai: AiConfig;
  schemaVersion: number;
}
