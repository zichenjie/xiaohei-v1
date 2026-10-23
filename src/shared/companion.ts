export interface CompanionContext {
  idleSeconds: number;
  blocked: boolean;
}

export type InvitationKind = "touch" | "play";
export interface CompanionBubble {
  id: string;
  kind: InvitationKind | "thanks" | "busy";
  expiresAt: number;
  anchor: { x: number; y: number; width: number };
}
export type CompanionReply = { id: string; response: "accept" | "busy" };

export const COMPANION_COPY = {
  touch: { text: "可以摸摸头吗？", accept: "摸摸头" },
  play: { text: "陪我玩一下？", accept: "陪你玩" },
  thanks: { text: "嘿嘿，有你陪着真好。", accept: "" },
  busy: { text: "好，我安静陪着你。", accept: "" }
} as const;
